import {
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuditActorType,
  UserStatus,
} from '@prisma/client';

import {
  createEmailFingerprint,
} from '../../src/audit/audit-context.util';
import {
  AuditActions,
  AuditEntityTypes,
} from '../../src/audit/audit-events.constants';
import { AuditService } from '../../src/audit/audit.service';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import type { RequestContextRequest } from '../../src/common/types/request-context.type';

function createRequest(): RequestContextRequest {
  return {
    requestId: 'request-id',
    correlationId: 'correlation-id',
    ip: '127.0.0.1',
  } as RequestContextRequest;
}

describe('AuthController audit events', () => {
  const recordSafe = jest.fn();

  const auditService = {
    recordSafe,
  } as unknown as AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    recordSafe.mockResolvedValue(undefined);
  });

  it('records successful registration', async () => {
    const user = {
      id: 'user-id',
      email: 'user@example.com',
      status:
        UserStatus.PENDING_VERIFICATION,
    };

    const authService = {
      register: jest.fn().mockResolvedValue({
        message: 'registered',
        user,
      }),
    } as unknown as AuthService;

    const controller = new AuthController(
      authService,
      auditService,
    );

    const result = await controller.register(
      {
        email: user.email,
        password: 'StrongPassword123!',
      },
      createRequest(),
    );

    expect(result.user).toEqual(user);

    expect(recordSafe).toHaveBeenCalledWith({
      actorType: AuditActorType.USER,
      actorId: 'user-id',
      action:
        AuditActions.AUTH_REGISTRATION_SUCCEEDED,
      entityType:
        AuditEntityTypes.USER,
      entityId: 'user-id',
      requestId: 'request-id',
      correlationId: 'correlation-id',
      ipAddress: '127.0.0.1',
      newState: {
        status:
          UserStatus.PENDING_VERIFICATION,
      },
      metadata: {
        channel: 'password',
      },
    });
  });

  it('records successful login', async () => {
    const email = 'User@Example.com';

    const authService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: 'user-id',
          email:
            email.toLowerCase(),
          status: UserStatus.ACTIVE,
        },
      }),
    } as unknown as AuthService;

    const controller = new AuthController(
      authService,
      auditService,
    );

    await controller.login(
      {
        email,
        password: 'StrongPassword123!',
      },
      createRequest(),
    );

    expect(recordSafe).toHaveBeenCalledWith({
      actorType: AuditActorType.USER,
      actorId: 'user-id',
      action:
        AuditActions.AUTH_LOGIN_SUCCEEDED,
      entityType:
        AuditEntityTypes.AUTH_SESSION,
      entityId: 'user-id',
      requestId: 'request-id',
      correlationId: 'correlation-id',
      ipAddress: '127.0.0.1',
      metadata: {
        emailFingerprint:
          createEmailFingerprint(email),
        authenticationMethod:
          'password',
      },
    });
  });

  it('records failed login without storing raw email', async () => {
    const email =
      'Sensitive.User@Example.com';

    const authService = {
      login: jest.fn().mockRejectedValue(
        new UnauthorizedException(
          'Invalid email or password',
        ),
      ),
    } as unknown as AuthService;

    const controller = new AuthController(
      authService,
      auditService,
    );

    await expect(
      controller.login(
        {
          email,
          password:
            'InvalidPassword123!',
        },
        createRequest(),
      ),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const fingerprint =
      createEmailFingerprint(email);

    expect(recordSafe).toHaveBeenCalledWith({
      actorType:
        AuditActorType.SYSTEM,
      action:
        AuditActions.AUTH_LOGIN_FAILED,
      entityType:
        AuditEntityTypes.AUTH_SESSION,
      entityId: fingerprint,
      requestId: 'request-id',
      correlationId: 'correlation-id',
      ipAddress: '127.0.0.1',
      metadata: {
        emailFingerprint: fingerprint,
        authenticationMethod:
          'password',
        reason:
          'authentication_rejected',
      },
    });

    expect(
      JSON.stringify(
        recordSafe.mock.calls[0][0],
      ),
    ).not.toContain(email);
  });

  it('records successful email verification', async () => {
    const user = {
      id: 'user-id',
      email: 'user@example.com',
      status: UserStatus.ACTIVE,
    };

    const authService = {
      verifyEmail:
        jest.fn().mockResolvedValue({
          message:
            'Email verified successfully',
          user,
        }),
    } as unknown as AuthService;

    const controller = new AuthController(
      authService,
      auditService,
    );

    await controller.verifyEmail(
      {
        token: 'verification-token',
      },
      createRequest(),
    );

    expect(recordSafe).toHaveBeenCalledWith({
      actorType: AuditActorType.USER,
      actorId: 'user-id',
      action:
        AuditActions.AUTH_EMAIL_VERIFIED,
      entityType:
        AuditEntityTypes.USER,
      entityId: 'user-id',
      requestId: 'request-id',
      correlationId: 'correlation-id',
      ipAddress: '127.0.0.1',
      newState: {
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    });
  });

  it('does not fail login when audit persistence fails safely', async () => {
    const authService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: 'user-id',
          email: 'user@example.com',
          status: UserStatus.ACTIVE,
        },
      }),
    } as unknown as AuthService;

    recordSafe.mockResolvedValue(
      undefined,
    );

    const controller = new AuthController(
      authService,
      auditService,
    );

    await expect(
      controller.login(
        {
          email: 'user@example.com',
          password:
            'StrongPassword123!',
        },
        createRequest(),
      ),
    ).resolves.toMatchObject({
      accessToken: 'access-token',
      user: {
        id: 'user-id',
      },
    });
  });
});
