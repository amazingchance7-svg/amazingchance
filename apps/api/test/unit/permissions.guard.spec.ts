import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Reflector,
} from '@nestjs/core';

import { AuthorizationService } from '../../src/authorization/authorization.service';
import { Permissions } from '../../src/authorization/permissions.constants';
import { PermissionsGuard } from '../../src/authorization/permissions.guard';

function createContext(
  user?: {
    id: string;
    mfaVerified?: boolean;
  },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
      }),
    }),
    getHandler:
      () =>
        function handler() {},
    getClass:
      () =>
        class Controller {},
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('returns 401 when no authenticated user exists', async () => {
    const reflector = {
      getAllAndOverride:
        jest.fn(),
    } as unknown as Reflector;

    const authorization = {
      hasAllPermissions:
        jest.fn(),
      hasActiveMfa:
        jest.fn(),
    } as unknown as AuthorizationService;

    const guard =
      new PermissionsGuard(
        reflector,
        authorization,
      );

    await expect(
      guard.canActivate(
        createContext(),
      ),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('denies by default when permission metadata is absent', async () => {
    const reflector = {
      getAllAndOverride:
        jest
          .fn()
          .mockReturnValue(
            undefined,
          ),
    } as unknown as Reflector;

    const authorization = {
      hasAllPermissions:
        jest.fn(),
      hasActiveMfa:
        jest.fn(),
    } as unknown as AuthorizationService;

    const guard =
      new PermissionsGuard(
        reflector,
        authorization,
      );

    await expect(
      guard.canActivate(
        createContext({
          id: 'user-id',
        }),
      ),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns 403 when any required permission is missing', async () => {
    const reflector = {
      getAllAndOverride:
        jest
          .fn()
          .mockReturnValue([
            Permissions
              .DRAW_CREATE,
            Permissions
              .DRAW_PUBLISH,
          ]),
    } as unknown as Reflector;

    const authorization = {
      hasAllPermissions:
        jest
          .fn()
          .mockResolvedValue(
            false,
          ),
      hasActiveMfa:
        jest.fn(),
    } as unknown as AuthorizationService;

    const guard =
      new PermissionsGuard(
        reflector,
        authorization,
      );

    await expect(
      guard.canActivate(
        createContext({
          id: 'user-id',
          mfaVerified: true,
        }),
      ),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('blocks a privileged operation when the access token lacks MFA assurance', async () => {
    const reflector = {
      getAllAndOverride:
        jest
          .fn()
          .mockReturnValue([
            Permissions
              .DRAW_CREATE,
          ]),
    } as unknown as Reflector;

    const authorization = {
      hasAllPermissions:
        jest
          .fn()
          .mockResolvedValue(
            true,
          ),
      hasActiveMfa:
        jest
          .fn()
          .mockResolvedValue(
            true,
          ),
    } as unknown as AuthorizationService;

    const guard =
      new PermissionsGuard(
        reflector,
        authorization,
      );

    await expect(
      guard.canActivate(
        createContext({
          id: 'user-id',
          mfaVerified: false,
        }),
      ),
    ).rejects.toThrow(
      'MFA verification is required for privileged operations',
    );
  });

  it('blocks a privileged operation when MFA was disabled after token issuance', async () => {
    const reflector = {
      getAllAndOverride:
        jest
          .fn()
          .mockReturnValue([
            Permissions
              .DRAW_CREATE,
          ]),
    } as unknown as Reflector;

    const authorization = {
      hasAllPermissions:
        jest
          .fn()
          .mockResolvedValue(
            true,
          ),
      hasActiveMfa:
        jest
          .fn()
          .mockResolvedValue(
            false,
          ),
    } as unknown as AuthorizationService;

    const guard =
      new PermissionsGuard(
        reflector,
        authorization,
      );

    await expect(
      guard.canActivate(
        createContext({
          id: 'user-id',
          mfaVerified: true,
        }),
      ),
    ).rejects.toThrow(
      'MFA verification is required for privileged operations',
    );
  });

  it('allows access only when permission and MFA are both current', async () => {
    const reflector = {
      getAllAndOverride:
        jest
          .fn()
          .mockReturnValue([
            Permissions
              .DRAW_CREATE,
          ]),
    } as unknown as Reflector;

    const hasAllPermissions =
      jest
        .fn()
        .mockResolvedValue(
          true,
        );

    const hasActiveMfa =
      jest
        .fn()
        .mockResolvedValue(
          true,
        );

    const guard =
      new PermissionsGuard(
        reflector,
        {
          hasAllPermissions,
          hasActiveMfa,
        } as unknown as AuthorizationService,
      );

    await expect(
      guard.canActivate(
        createContext({
          id: 'user-id',
          mfaVerified: true,
        }),
      ),
    ).resolves.toBe(true);

    expect(
      hasAllPermissions,
    ).toHaveBeenCalledWith(
      'user-id',
      [
        Permissions
          .DRAW_CREATE,
      ],
    );

    expect(
      hasActiveMfa,
    ).toHaveBeenCalledWith(
      'user-id',
    );
  });
});
