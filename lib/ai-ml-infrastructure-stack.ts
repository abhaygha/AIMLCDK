import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class AiMlInfrastructureStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC for EKS
    const vpc = new ec2.Vpc(this, 'AiMlVpc', {
      maxAzs: 2
    });

    // Create EKS Cluster
    const cluster = new eks.Cluster(this, 'AiMlCluster', {
      version: eks.KubernetesVersion.V1_28,
      vpc,
      defaultCapacity: 2,
      defaultCapacityInstance: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      kubectlLayer: lambda.LayerVersion.fromLayerVersionArn(
        this,
        'KubectlLayer',
        `arn:aws:lambda:${this.region}:903779448426:layer:kubectl-layer-v28:1`
      )
    });

    // Create ECR Repository
    const ecrRepo = new ecr.Repository(this, 'AiMlRepository', {
      repositoryName: 'ai-ml-artifacts',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: 'Keep only 5 latest images'
        }
      ]
    });

    // Create S3 bucket for Bedrock outputs
    const bedrockOutputBucket = new s3.Bucket(this, 'BedrockOutputBucket', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true
    });

    // Create SNS Topic for notifications
    const notificationTopic = new sns.Topic(this, 'RiskAssessmentTopic', {
      displayName: 'AI Risk Assessment Notifications'
    });

    notificationTopic.addSubscription(
      new subscriptions.EmailSubscription('your-email@example.com')
    );

    // Create Lambda function for risk assessment
    const riskAssessmentFunction = new lambda.Function(this, 'RiskAssessmentFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/risk-assessment'),
      environment: {
        BEDROCK_REGION: this.region,
        SNS_TOPIC_ARN: notificationTopic.topicArn,
        S3_BUCKET_NAME: bedrockOutputBucket.bucketName,
        ECR_REPOSITORY_URI: ecrRepo.repositoryUri,
        EKS_CLUSTER_NAME: cluster.clusterName
      },
    });

    // Add permissions to Lambda
    riskAssessmentFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock:*',
          'sns:Publish',
          's3:PutObject',
          's3:GetObject',
          'ecr:*',
          'eks:*'
        ],
        resources: [
          notificationTopic.topicArn,
          bedrockOutputBucket.bucketArn,
          `${bedrockOutputBucket.bucketArn}/*`,
          ecrRepo.repositoryArn,
          cluster.clusterArn
        ],
      })
    );

    // Create Lambda function for failure analysis
    const failureAnalysisFunction = new lambda.Function(this, 'FailureAnalysisFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/failure-analysis'),
      environment: {
        BEDROCK_REGION: this.region,
        SNS_TOPIC_ARN: notificationTopic.topicArn,
        S3_BUCKET_NAME: bedrockOutputBucket.bucketName
      },
      timeout: cdk.Duration.minutes(5)
    });

    // Add Bedrock permissions to the failure analysis Lambda
    failureAnalysisFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'sns:Publish',
          's3:PutObject',
          's3:GetObject'
        ],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          notificationTopic.topicArn,
          bedrockOutputBucket.bucketArn,
          `${bedrockOutputBucket.bucketArn}/*`
        ],
      })
    );

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'RiskAssessmentApi', {
      restApiName: 'Risk Assessment Service',
      description: 'API Gateway for AI/ML risk assessment'
    });

    const riskAssessment = api.root.addResource('assess');
    riskAssessment.addMethod('POST', new apigateway.LambdaIntegration(riskAssessmentFunction));

    // Add failure analysis endpoint to API Gateway
    const failureAnalysis = api.root.addResource('analyze-failure');
    failureAnalysis.addMethod('POST', new apigateway.LambdaIntegration(failureAnalysisFunction));

    // Create GitHub Actions deployment role
    const githubDeployRole = new iam.Role(this, 'GitHubDeployRole', {
      assumedBy: new iam.WebIdentityPrincipal('token.actions.githubusercontent.com', {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${process.env.GITHUB_REPOSITORY || 'abhaygha/AIMLCDK'}:ref:refs/heads/main`
        },
      }),
      description: 'Role used by GitHub Actions to deploy CDK stacks',
      roleName: 'github-actions-deploy-role'
    });

    // Add deployment permissions
    githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:*',
          'iam:*',
          'lambda:*',
          'apigateway:*',
          'sns:*',
          'bedrock:*',
          's3:*',
          'ecr:*',
          'eks:*',
          'ec2:*'
        ],
        resources: ['*']
      })
    );

    // Outputs
    new cdk.CfnOutput(this, 'EksClusterName', {
      value: cluster.clusterName,
      description: 'Name of the EKS cluster'
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: ecrRepo.repositoryUri,
      description: 'URI of the ECR repository'
    });

    new cdk.CfnOutput(this, 'BedrockOutputBucketName', {
      value: bedrockOutputBucket.bucketName,
      description: 'Name of the S3 bucket for Bedrock outputs'
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: riskAssessmentFunction.functionName,
      description: 'Name of the Risk Assessment Lambda Function'
    });

    new cdk.CfnOutput(this, 'FailureAnalysisLambdaName', {
      value: failureAnalysisFunction.functionName,
      description: 'Name of the Failure Analysis Lambda Function'
    });

    new cdk.CfnOutput(this, 'NotificationTopicArn', {
      value: notificationTopic.topicArn,
      description: 'ARN of the SNS notification topic'
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'URL of the Risk Assessment API'
    });

    new cdk.CfnOutput(this, 'GitHubDeployRoleArn', {
      value: githubDeployRole.roleArn,
      description: 'ARN of the GitHub Actions deployment role'
    });
  }
}