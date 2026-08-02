import { AuthorizationService } from '../../src/authorization/authorization.service';
import { Permissions } from '../../src/authorization/permissions.constants';

describe('AuthorizationService', () => {
  it('combines and deduplicates permissions from multiple roles', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        role: {
          permissions: [
            { permission: { code: Permissions.DRAW_CREATE } },
            { permission: { code: Permissions.DRAW_UPDATE } },
          ],
        },
      },
      {
        role: {
          permissions: [
            { permission: { code: Permissions.DRAW_CREATE } },
          ],
        },
      },
    ]);

    const service = new AuthorizationService({
      userRole: { findMany },
    } as never);

    const permissions = await service.getUserPermissions('user-id');

    expect(permissions).toEqual(
      new Set([
        Permissions.DRAW_CREATE,
        Permissions.DRAW_UPDATE,
      ]),
    );
  });

  it('requires every requested permission', async () => {
    const service = new AuthorizationService({
      userRole: {
        findMany: jest.fn().mockResolvedValue([
          {
            role: {
              permissions: [
                { permission: { code: Permissions.DRAW_CREATE } },
              ],
            },
          },
        ]),
      },
    } as never);

    await expect(
      service.hasAllPermissions('user-id', [Permissions.DRAW_CREATE]),
    ).resolves.toBe(true);

    await expect(
      service.hasAllPermissions('user-id', [
        Permissions.DRAW_CREATE,
        Permissions.DRAW_PUBLISH,
      ]),
    ).resolves.toBe(false);
  });
});
