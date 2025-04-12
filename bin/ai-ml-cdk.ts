#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AiMlInfrastructureStack } from '../lib/ai-ml-infrastructure-stack';

const app = new cdk.App();
new AiMlInfrastructureStack(app, 'AiMlInfrastructureStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
}); 