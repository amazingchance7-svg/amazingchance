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
    protocols: ['redis'],
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
  STRIPE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  STRIPE_WEBHOOK_SECRET?: string;
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
    validatedConfig.JWT_ACCESS_SECRET ===
    validatedConfig.JWT_REFRESH_SECRET
  ) {
    throw new Error(
      'Environment validation failed: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    );
  }

  if (
    validatedConfig.NODE_ENV ===
      NodeEnvironment.Production &&
    (
      typeof config.WEB_URL !==
        'string' ||
      config.WEB_URL.trim()
        .length === 0
    )
  ) {
    throw new Error(
      'Environment validation failed: WEB_URL is required in production',
    );
  }

  if (
    validatedConfig.NODE_ENV ===
      NodeEnvironment.Production &&
    (
      !validatedConfig.STRIPE_SECRET_KEY ||
      !validatedConfig.STRIPE_WEBHOOK_SECRET
    )
  ) {
    throw new Error(
      'Environment validation failed: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required in production',
    );
  }

  return validatedConfig;
}
