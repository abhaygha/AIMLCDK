# AI/ML Infrastructure with AWS CDK

This project sets up a complete AI/ML infrastructure using AWS CDK, including AWS Bedrock integration, CI/CD pipelines, and automated risk assessment.

## Features

- AWS Bedrock integration for large language models
- EKS cluster for ML model deployment
- ECR repository for ML model storage
- CI/CD pipeline for automated training and deployment
- AI-driven risk assessment for code changes
- Infrastructure as Code using AWS CDK

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js and npm installed
- AWS CDK CLI installed
- Docker installed (for local development)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Bootstrap AWS CDK (if not already done):
```bash
cdk bootstrap
```

3. Deploy the infrastructure:
```bash
cdk deploy
```

## Project Structure

- `lib/ai-ml-infrastructure-stack.ts`: Main infrastructure stack definition
- `lambda/risk-assessment/`: Lambda function for AI-driven risk assessment
- `bin/ai-ml-cdk.ts`: CDK app entry point

## Components

### AWS Bedrock Integration
- Configured with appropriate IAM roles and permissions
- Integrated with Lambda for risk assessment

### CI/CD Pipeline
- GitHub integration for source code
- CodeBuild for ML model training and deployment
- Automated testing and validation

### Risk Assessment
- AI-driven analysis of code changes
- Security and compliance checks
- Performance impact assessment

## Security

- IAM roles with least privilege principle
- Secure storage of ML models in ECR
- Encrypted S3 bucket for artifacts
- VPC configuration for EKS cluster

## Cost Optimization

- Auto-scaling configuration for EKS
- Spot instances for non-critical workloads
- Cost monitoring and alerts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 