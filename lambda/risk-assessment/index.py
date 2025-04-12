import json
import boto3
import os
import logging
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock = boto3.client('bedrock-runtime')
sns = boto3.client('sns')
s3 = boto3.client('s3')

def store_assessment(assessment, commit_sha):
    """Store the Bedrock assessment results in S3"""
    bucket_name = os.environ['S3_BUCKET_NAME']
    timestamp = datetime.now().strftime('%Y-%m-%d-%H-%M-%S')
    key = f'assessments/{commit_sha}/{timestamp}.json'
    
    try:
        s3.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=json.dumps({
                'commit_sha': commit_sha,
                'timestamp': timestamp,
                'assessment': assessment
            }),
            ContentType='application/json'
        )
        logger.info(f"Stored assessment in S3: s3://{bucket_name}/{key}")
        return f"s3://{bucket_name}/{key}"
    except Exception as e:
        logger.error(f"Failed to store assessment in S3: {str(e)}")
        raise

def analyze_code_changes(changes, commit_sha):
    logger.info(f"Analyzing changes for commit: {commit_sha}")
    
    prompt = f"""
    Analyze the following code changes for potential risks and issues:
    {changes}
    
    Consider the following aspects:
    1. Security vulnerabilities
    2. Performance impacts
    3. Integration issues
    4. Data privacy concerns
    5. Compliance requirements
    6. Container security (if Docker files present)
    7. Kubernetes deployment risks
    
    Provide a detailed risk assessment with recommendations.
    """
    
    try:
        response = bedrock.invoke_model(
            modelId='anthropic.claude-v2',
            body=json.dumps({
                "prompt": prompt,
                "max_tokens_to_sample": 1000,
                "temperature": 0.5,
                "top_p": 0.9,
            })
        )
        
        assessment = json.loads(response['body'].read())['completion']
        logger.info("Successfully completed risk assessment")
        
        # Store assessment in S3
        s3_uri = store_assessment(assessment, commit_sha)
        
        # Send notification
        if os.environ.get('SNS_TOPIC_ARN'):
            sns.publish(
                TopicArn=os.environ['SNS_TOPIC_ARN'],
                Subject=f"Risk Assessment Complete - Commit {commit_sha[:7]}",
                Message=f"""Risk Assessment Results:

Assessment: {assessment}

Full results stored at: {s3_uri}
"""
            )
        
        return assessment, s3_uri
        
    except Exception as e:
        logger.error(f"Error in risk assessment: {str(e)}")
        raise

def handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")
    
    try:
        # Extract information from the event
        code_changes = event.get('code_changes', '')
        commit_sha = event.get('commit', 'unknown')
        
        # Perform risk assessment
        assessment, s3_uri = analyze_code_changes(code_changes, commit_sha)
        
        response = {
            'statusCode': 200,
            'body': json.dumps({
                'commit': commit_sha,
                'risk_assessment': assessment,
                'results_location': s3_uri
            })
        }
        
        logger.info(f"Completed processing for commit: {commit_sha}")
        return response
        
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }