import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export class MerkleProofNodeDto {
  @ApiProperty({
    example:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    description: 'SHA-256 hash of the sibling Merkle node',
    pattern: '^[0-9a-f]{64}$',
  })
  @IsString()
  @Matches(SHA256_HEX_PATTERN, {
    message:
      'proof node hash must be a lowercase 64-character SHA-256 hex string',
  })
  hash!: string;

  @ApiProperty({
    enum: ['LEFT', 'RIGHT'],
    example: 'RIGHT',
    description:
      'Position of the sibling node relative to the calculated node',
  })
  @IsString()
  @IsIn(['LEFT', 'RIGHT'])
  side!: 'LEFT' | 'RIGHT';
}

export class VerifyMerkleProofDto {
  @ApiProperty({
    example: 'AMAZING_CHANCE_MERKLE_PROOF_V1',
    description: 'Merkle proof format version',
  })
  @IsString()
  @IsIn(['AMAZING_CHANCE_MERKLE_PROOF_V1'])
  verificationVersion!: string;

  @ApiProperty({
    example:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    description: 'SHA-256 leaf hash being verified',
    pattern: '^[0-9a-f]{64}$',
  })
  @IsString()
  @Matches(SHA256_HEX_PATTERN, {
    message:
      'leafHash must be a lowercase 64-character SHA-256 hex string',
  })
  leafHash!: string;

  @ApiProperty({
    example:
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    description:
      'Merkle root supplied with the proof and expected to match the official snapshot',
    pattern: '^[0-9a-f]{64}$',
  })
  @IsString()
  @Matches(SHA256_HEX_PATTERN, {
    message:
      'merkleRoot must be a lowercase 64-character SHA-256 hex string',
  })
  merkleRoot!: string;

  @ApiProperty({
    type: [MerkleProofNodeDto],
    description:
      'Ordered Merkle proof nodes from the leaf level toward the root',
  })
  @IsArray()
  @ArrayMaxSize(128)
  @ValidateNested({
    each: true,
  })
  @Type(() => MerkleProofNodeDto)
  proof!: MerkleProofNodeDto[];
}