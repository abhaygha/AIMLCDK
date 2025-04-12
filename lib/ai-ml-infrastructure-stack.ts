import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class AiMlInfrastructureStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create EKS Cluster
    const cluster = new eks.Cluster(this, 'AiMlEksCluster', {
      version: eks.KubernetesVersion.V1_28,
      defaultCapacity: 2,
      vpc: new ec2.Vpc(this, 'AiMlVpc'),
      kubectlLayer: new lambda.LayerVersion(this, 'KubectlLayer', {
        code: lambda.Code.fromAsset('lambda/kubectl-layer'),
        compatibleRuntimes: [lambda.Runtime.PYTHON_3_11]
      })
    });

    // Create ECR Repository for ML models
    const modelRepository = new ecr.Repository(this, 'MlModelRepository', {
      repositoryName: 'ml-models',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create S3 bucket for ML artifacts
    const mlArtifactsBucket = new s3.Bucket(this, 'MlArtifactsBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create IAM role for Bedrock access
    const bedrockRole = new iam.Role(this, 'BedrockRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });

    // Add Bedrock permissions
    bedrockRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess')
    );

    // Create CodeBuild project for ML pipeline
    const mlPipelineProject = new codebuild.Project(this, 'MlPipelineProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'echo "Building ML pipeline..."',
              'aws s3 sync s3://${ML_ARTIFACTS_BUCKET}/models ./models',
              'docker build -t ${ECR_REPO_URI}:latest .',
              'docker push ${ECR_REPO_URI}:latest',
            ],
          },
        },
      }),
    });

    // Create CI/CD Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'MlPipeline', {
      pipelineName: 'ml-pipeline',
    });

    // Add source stage
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source',
      owner: 'abhaygha',
      repo: 'AIMLCDK',
      oauthToken: cdk.SecretValue.secretsManager('github-token'),
      output: sourceOutput,
      branch: 'main',
    });

    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });

    // Add build stage
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: mlPipelineProject,
      input: sourceOutput,
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [buildAction],
    });

    // Create Lambda function for risk assessment
    const riskAssessmentFunction = new lambda.Function(this, 'RiskAssessmentFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/risk-assessment'),
      environment: {
        BEDROCK_REGION: this.region,
      },
    });

    // Add Bedrock permissions to Lambda
    riskAssessmentFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:*'],
        resources: ['*'],
      })
    );

    // Output important information
    new cdk.CfnOutput(this, 'EksClusterName', {
      value: cluster.clusterName,
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: modelRepository.repositoryUri,
    });

    new cdk.CfnOutput(this, 'MlArtifactsBucketName', {
      value: mlArtifactsBucket.bucketName,
    });
  }
} 