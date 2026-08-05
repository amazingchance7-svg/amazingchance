import type { HelmetOptions } from 'helmet';

export const PERMISSIONS_POLICY_HEADER =
  'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=()';

export function createHelmetOptions(
  isProduction: boolean,
): HelmetOptions {
  return {
    contentSecurityPolicy: isProduction
      ? {
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
        }
      : false,

    crossOriginEmbedderPolicy: false,

    crossOriginOpenerPolicy: {
      policy: 'same-origin',
    },

    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },

    dnsPrefetchControl: {
      allow: false,
    },

    frameguard: {
      action: 'deny',
    },

    hidePoweredBy: true,

    hsts: isProduction
      ? {
          maxAge: 31_536_000,
          includeSubDomains: true,
          preload: true,
        }
      : false,

    ieNoOpen: true,

    noSniff: true,

    originAgentCluster: true,

    permittedCrossDomainPolicies: {
      permittedPolicies: 'none',
    },

    referrerPolicy: {
      policy: 'no-referrer',
    },

    xssFilter: false,
  };
}
