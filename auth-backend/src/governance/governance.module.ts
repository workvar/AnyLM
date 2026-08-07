import { Module } from "@nestjs/common";
import { OrgsService } from "../orgs/orgs.service";
import { OrgsController } from "../orgs/orgs.controller";
import { PoliciesService } from "../policies/policies.service";
import { PoliciesController } from "../policies/policies.controller";
import { UsageService } from "../usage/usage.service";
import { UsageController } from "../usage/usage.controller";
import { InvitesService } from "../invites/invites.service";
import { InvitesController } from "../invites/invites.controller";
import { TeamsService } from "../teams/teams.service";
import { LogsService } from "../logs/logs.service";
import { LogsController } from "../logs/logs.controller";
import { ApiKeysService } from "../apikeys/apikeys.service";
import { ApiKeysController } from "../apikeys/apikeys.controller";
import { ProxyController } from "../proxy/proxy.controller";

// Orgs, policies, usage metering, invitations, teams, compliance logging,
// API keys, and the /v1 LLM proxy form one cohesive governance domain.
@Module({
  controllers: [
    OrgsController,
    PoliciesController,
    UsageController,
    InvitesController,
    LogsController,
    ApiKeysController,
    ProxyController,
  ],
  providers: [
    OrgsService,
    PoliciesService,
    UsageService,
    InvitesService,
    TeamsService,
    LogsService,
    ApiKeysService,
  ],
})
export class GovernanceModule {}
