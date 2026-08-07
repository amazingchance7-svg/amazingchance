import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { VerifyMerkleProofDto } from '../snapshots/dto/verify-merkle-proof.dto';
import { PublicAuditService } from '../snapshots/public-audit.service';
import { PublicProofService } from '../snapshots/public-proof.service';
import { PublicSnapshotService } from '../snapshots/public-snapshot.service';
import { PublicVerificationService } from '../snapshots/public-verification.service';
import { ListLotteryDrawsDto } from './dto/list-lottery-draws.dto';
import { LotteryDrawsService } from './lottery-draws.service';
import { PublicDrawResultService } from './public-draw-result.service';

@ApiTags('Lottery Draws')
@Controller('lottery-draws')
export class LotteryDrawsController {
  constructor(
    private readonly lotteryDrawsService: LotteryDrawsService,
    private readonly publicSnapshotService: PublicSnapshotService,
    private readonly publicProofService: PublicProofService,
    private readonly publicVerificationService: PublicVerificationService,
    private readonly publicAuditService: PublicAuditService,
    private readonly publicDrawResultService: PublicDrawResultService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get lottery draws',
  })
  @ApiOkResponse({
    description:
      'Lottery draws returned successfully.',
  })
  findAll(
    @Query() query: ListLotteryDrawsDto,
  ) {
    return this.lotteryDrawsService.findAll(
      query,
    );
  }

  @Get(':id/result')
  @ApiOperation({
    summary:
      'Get the official published draw result and verification evidence',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description:
      'Published lottery draw result returned successfully.',
  })
  @ApiNotFoundResponse({
    description:
      'Published result or required verification evidence was not found.',
  })
  findPublishedResult(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.publicDrawResultService.findPublishedByDrawId(
      id,
    );
  }

  @Get(':id/audit')
  @ApiOperation({
    summary:
      'Get the public audit manifest for a finalized draw snapshot',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description:
      'Public audit manifest returned successfully.',
  })
  @ApiNotFoundResponse({
    description:
      'Finalized ticket snapshot not found.',
  })
  findAuditManifest(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.publicAuditService.findManifestByDrawId(
      id,
    );
  }

  @Get(':id/snapshot/download')
  @ApiOperation({
    summary:
      'Download the canonical finalized ticket snapshot',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description:
      'Canonical finalized ticket snapshot returned successfully.',
  })
  @ApiConflictResponse({
    description:
      'Stored snapshot commitment does not match its entries.',
  })
  @ApiNotFoundResponse({
    description:
      'Finalized ticket snapshot not found.',
  })
  async downloadSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const download =
      await this.publicSnapshotService.downloadFinalizedByDrawId(
        id,
      );

    response.setHeader(
      'Content-Type',
      download.contentType,
    );

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${download.filename}"`,
    );

    response.setHeader(
      'X-Snapshot-SHA256',
      download.snapshotHash,
    );

    response
      .status(200)
      .send(
        download.canonicalSnapshot,
      );
  }

  @Get(':id/snapshot')
  @ApiOperation({
    summary:
      'Get a finalized public ticket snapshot',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description:
      'Finalized public ticket snapshot returned successfully.',
  })
  @ApiNotFoundResponse({
    description:
      'Finalized ticket snapshot not found.',
  })
  findSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.publicSnapshotService.findFinalizedByDrawId(
      id,
    );
  }

  @Get(
    ':id/tickets/:ticketPublicId/proof',
  )
  @ApiOperation({
    summary:
      'Get a Merkle proof for a finalized ticket',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiParam({
    name: 'ticketPublicId',
    description:
      'Public ticket identifier',
  })
  @ApiOkResponse({
    description:
      'Merkle proof returned successfully.',
  })
  @ApiConflictResponse({
    description:
      'Stored snapshot integrity does not match its entries.',
  })
  @ApiNotFoundResponse({
    description:
      'Finalized snapshot or ticket was not found.',
  })
  findTicketProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketPublicId')
    ticketPublicId: string,
  ) {
    return this.publicProofService.findProofByTicketPublicId(
      id,
      ticketPublicId,
    );
  }

  @Post(':id/verify-proof')
  @ApiOperation({
    summary:
      'Verify a Merkle proof against the official finalized snapshot',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description:
      'Merkle proof verification result returned successfully.',
  })
  @ApiBadRequestResponse({
    description:
      'Merkle proof request has an invalid format.',
  })
  @ApiNotFoundResponse({
    description:
      'Finalized ticket snapshot not found.',
  })
  verifyProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyMerkleProofDto,
  ) {
    return this.publicVerificationService.verifyProof(
      id,
      dto,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get lottery draw by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description:
      'Lottery draw returned successfully.',
  })
  @ApiNotFoundResponse({
    description:
      'Lottery draw not found.',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.lotteryDrawsService.findOne(
      id,
    );
  }
}
