import {
  createHelmetOptions,
  PERMISSIONS_POLICY_HEADER,
} from '../../src/config/security-headers.config';

describe('security headers configuration', () => {
  it('uses strict CSP and HSTS in production', () => {
    const options =
      createHelmetOptions(true);

    expect(
      options.contentSecurityPolicy,
    ).toEqual({
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        connectSrc: ["'none'"],
        fontSrc: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'none'"],
        imgSrc: ["'none'"],
        manifestSrc: ["'none'"],
        mediaSrc: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
        workerSrc: ["'none'"],
      },
    });

    expect(options.hsts).toEqual({
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true,
    });

    expect(
      options.frameguard,
    ).toEqual({
      action: 'deny',
    });

    expect(
      options.referrerPolicy,
    ).toEqual({
      policy: 'no-referrer',
    });

    expect(
      options.crossOriginOpenerPolicy,
    ).toEqual({
      policy: 'same-origin',
    });

    expect(
      options.crossOriginResourcePolicy,
    ).toEqual({
      policy: 'cross-origin',
    });
  });

  it('disables CSP and HSTS outside production', () => {
    const options =
      createHelmetOptions(false);

    expect(
      options.contentSecurityPolicy,
    ).toBe(false);

    expect(options.hsts).toBe(false);
  });

  it('disables browser capabilities that the API does not need', () => {
    expect(
      PERMISSIONS_POLICY_HEADER,
    ).toContain('camera=()');

    expect(
      PERMISSIONS_POLICY_HEADER,
    ).toContain('geolocation=()');

    expect(
      PERMISSIONS_POLICY_HEADER,
    ).toContain('microphone=()');

    expect(
      PERMISSIONS_POLICY_HEADER,
    ).toContain('payment=()');

    expect(
      PERMISSIONS_POLICY_HEADER,
    ).toContain(
      'publickey-credentials-get=()',
    );
  });
});
