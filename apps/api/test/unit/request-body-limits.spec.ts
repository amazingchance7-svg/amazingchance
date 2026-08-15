import {
  API_REQUEST_BODY_LIMIT,
} from '../../src/common/constants/request-body.constants';

describe(
  'Request body security limits',
  () => {
    it(
      'keeps API JSON ingress bounded at 100kb',
      () => {
        expect(
          API_REQUEST_BODY_LIMIT,
        ).toBe(
          '100kb',
        );
      },
    );
  },
);
