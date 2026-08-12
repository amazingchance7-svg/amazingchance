import {
  plainToInstance,
  Type,
} from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

const FORBIDDEN_PRODUCTION_DATABASE_USERS =
  new Set([
    'postgres',
    'amazing_chance_admin',
    'admin',
    'root',
  ]);

const PLACEHOLDER_MARKERS = [
  'change_me',
  'changeme',
  'replace_with',
  'example',
  'password',
  'secret',
];

class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment =
    NodeEnvironment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT = 3001;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsUrl({
    require_tld: false,
    protocols: [
      'redis',
      'rediss',
    ],
  })
  REDIS_URL!: string;

  @IsUrl({
    require_tld: false,
    protocols: [
      'http',
      'https',
    ],
  })
  WEB_URL =
    'http://localhost:3000';

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL_SECONDS =
    900;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(3600)
  JWT_REFRESH_TTL_SECONDS =
    2_592_000;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  SNAPSHOT_OWNER_SECRET!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  MFA_ENCRYPTION_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  STRIPE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  STRIPE_WEBHOOK_SECRET?: string;
}

function assertProductionDatabaseUrl(
  value: string,
): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'Environment validation failed: DATABASE_URL must be a valid PostgreSQL URL in production',
    );
  }

  if (
    url.protocol !==
      'postgresql:' &&
    url.protocol !==
      'postgres:'
  ) {
    throw new Error(
      'Environment validation failed: DATABASE_URL must use postgresql:// in production',
    );
  }

  const username =
    decodeURIComponent(
      url.username,
    ).toLowerCase();

  if (
    !username ||
    FORBIDDEN_PRODUCTION_DATABASE_USERS
      .has(username)
  ) {
    throw new Error(
      'Environment validation failed: DATABASE_URL must use a dedicated least-privilege runtime database user in production',
    );
  }

  const hostname =
    url.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  ) {
    throw new Error(
      'Environment validation failed: DATABASE_URL cannot target localhost in production',
    );
  }
}

function assertProductionRedisUrl(
  value: string,
): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'Environment validation failed: REDIS_URL must be a valid TLS Redis URL in production',
    );
  }

  if (
    url.protocol !==
    'rediss:'
  ) {
    throw new Error(
      'Environment validation failed: REDIS_URL must use rediss:// in production',
    );
  }

  const hostname =
    url.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  ) {
    throw new Error(
      'Environment validation failed: REDIS_URL cannot target localhost in production',
    );
  }
}

function assertProductionSecret(
  name: string,
  value: string,
): void {
  const normalized =
    value.trim().toLowerCase();

  if (
    PLACEHOLDER_MARKERS.some(
      (marker) =>
        normalized.includes(
          marker,
        ),
    )
  ) {
    throw new Error(
      `Environment validation failed: ${name} contains a placeholder or weak marker`,
    );
  }

  if (
    new Set(value).size < 12
  ) {
    throw new Error(
      `Environment validation failed: ${name} must contain sufficient character diversity in production`,
    );
  }
}

function assertMfaEncryptionKey(
  value: string,
): void {
  const decoded =
    Buffer.from(
      value,
      'base64',
    );

  if (
    decoded.length !== 32 ||
    decoded.toString(
      'base64',
    ) !== value
  ) {
    throw new Error(
      'Environment validation failed: MFA_ENCRYPTION_KEY must be canonical base64 encoding of exactly 32 bytes',
    );
  }
}

export function validateEnvironment(
  config: Record<
    string,
    unknown
  >,
): EnvironmentVariables {
  const validatedConfig =
    plainToInstance(
      EnvironmentVariables,
      config,
      {
        enableImplicitConversion:
          true,
      },
    );

  const errors =
    validateSync(
      validatedConfig,
      {
        skipMissingProperties:
          false,
        whitelist:
          true,
      },
    );

  if (
    errors.length >
    0
  ) {
    const messages =
      errors
        .flatMap(
          (error) =>
            Object.values(
              error.constraints ??
                {},
            ).map(
              (message) =>
                `${error.property}: ${message}`,
            ),
        )
        .join('; ');

    throw new Error(
      `Environment validation failed: ${messages}`,
    );
  }

  if (
    validatedConfig
      .JWT_ACCESS_SECRET ===
    validatedConfig
      .JWT_REFRESH_SECRET
  ) {
    throw new Error(
      'Environment validation failed: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    );
  }

  if (
    validatedConfig
      .MFA_ENCRYPTION_KEY
  ) {
    assertMfaEncryptionKey(
      validatedConfig
        .MFA_ENCRYPTION_KEY,
    );
  }

  if (
    validatedConfig.NODE_ENV !==
    NodeEnvironment.Production
  ) {
    return validatedConfig;
  }

  if (
    typeof config.WEB_URL !==
      'string' ||
    config.WEB_URL.trim()
      .length === 0
  ) {
    throw new Error(
      'Environment validation failed: WEB_URL is required in production',
    );
  }

  if (
    !validatedConfig.WEB_URL
      .startsWith(
        'https://',
      )
  ) {
    throw new Error(
      'Environment validation failed: WEB_URL must use https in production',
    );
  }

  assertProductionDatabaseUrl(
    validatedConfig
      .DATABASE_URL,
  );

  assertProductionRedisUrl(
    validatedConfig
      .REDIS_URL,
  );

  assertProductionSecret(
    'JWT_ACCESS_SECRET',
    validatedConfig
      .JWT_ACCESS_SECRET,
  );

  assertProductionSecret(
    'JWT_REFRESH_SECRET',
    validatedConfig
      .JWT_REFRESH_SECRET,
  );

  assertProductionSecret(
    'SNAPSHOT_OWNER_SECRET',
    validatedConfig
      .SNAPSHOT_OWNER_SECRET,
  );

  if (
    !validatedConfig
      .MFA_ENCRYPTION_KEY
  ) {
    throw new Error(
      'Environment validation failed: MFA_ENCRYPTION_KEY is required in production',
    );
  }

  if (
    !validatedConfig
      .STRIPE_SECRET_KEY ||
    !validatedConfig
      .STRIPE_WEBHOOK_SECRET
  ) {
    throw new Error(
      'Environment validation failed: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required in production',
    );
  }

  if (
    !validatedConfig
      .STRIPE_SECRET_KEY
      .startsWith('sk_live_')
  ) {
    throw new Error(
      'Environment validation failed: STRIPE_SECRET_KEY must be a live-mode key in production',
    );
  }

  if (
    !validatedConfig
      .STRIPE_WEBHOOK_SECRET
      .startsWith('whsec_')
  ) {
    throw new Error(
      'Environment validation failed: STRIPE_WEBHOOK_SECRET has an invalid production format',
    );
  }

  return validatedConfig;
}
