import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthorizationService } from '../../src/authorization/authorization.service';
import { Permissions } from '../../src/authorization/permissions.constants';
import { PermissionsGuard } from '../../src/authorization/permissions.guard';

function createContext(user?: { id: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('returns 401 when no authenticated user exists', async () => {
    const reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;
    const authorization = {
      hasAllPermissions: jest.fn(),
    } as unknown as AuthorizationService;
    const guard = new PermissionsGuard(reflector, authorization);

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('denies by default when permission metadata is absent', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const authorization = {
      hasAllPermissions: jest.fn(),
    } as unknown as AuthorizationService;
    const guard = new PermissionsGuard(reflector, authorization);

    await expect(
      guard.canActivate(createContext({ id: 'user-id' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 403 when any required permission is missing', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([
          Permissions.DRAW_CREATE,
          Permissions.DRAW_PUBLISH,
        ]),
    } as unknown as Reflector;
    const authorization = {
      hasAllPermissions: jest.fn().mockResolvedValue(false),
    } as unknown as AuthorizationService;
    const guard = new PermissionsGuard(reflector, authorization);

    await expect(
      guard.canActivate(createContext({ id: 'user-id' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows access only when all required permissions are current in DB', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([Permissions.DRAW_CREATE]),
    } as unknown as Reflector;
    const hasAllPermissions = jest.fn().mockResolvedValue(true);
    const guard = new PermissionsGuard(
      reflector,
      { hasAllPermissions } as unknown as AuthorizationService,
    );

    await expect(
      guard.canActivate(createContext({ id: 'user-id' })),
    ).resolves.toBe(true);
    expect(hasAllPermissions).toHaveBeenCalledWith('user-id', [
      Permissions.DRAW_CREATE,
    ]);
  });
});
