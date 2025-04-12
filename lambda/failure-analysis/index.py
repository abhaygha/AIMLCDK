import json
import os
import boto3
from datetime import datetime

def handler(event, context):
    # Initialize AWS clients
    bedrock = boto3.client('bedrock-runtime')
    sns = boto3.client('sns')
    s3 = boto3.client('s3')
    
    # Extract information from the event
    commit = event.get('commit', '')
    repository = event.get('repository', '')
    failure_context = event.get('failure_context', '')
    workflow_name = event.get('workflow_name', '')
    event_name = event.get('event_name', '')
    
    # Construct prompt for Bedrock
    prompt = f"""
    Analyze this CI/CD pipeline failure and provide:
    1. Root Cause Analysis
    2. Potential fixes
    3. Prevention strategies for future
    4. Risk assessment and impact

    Context:
    - Repository: {repository}
    - Commit: {commit}
    - Workflow: {workflow_name}
    - Event Type: {event_name}
    - Failure Details: {failure_context}

    Please structure your response in markdown format with clear sections.
    """
    
    # Call Bedrock (using Claude model)
    response = bedrock.invoke_model(
        modelId='anthropic.claude-v2',
        body=json.dumps({
            "prompt": prompt,
            "max_tokens": 2048,
            "temperature": 0.7,
            "top_p": 1,
            "stop_sequences": ["\n\nHuman:"]
        })
    )
    
    # Parse Bedrock response
    analysis = json.loads(response['body'].read())['completion']
    
    # Save analysis to S3
    timestamp = datetime.now().strftime('%Y-%m-%d-%H-%M-%S')
    s3_key = f'failure-analysis/{repository}/{commit}/{timestamp}.json'
    s3.put_object(
        Bucket=os.environ['S3_BUCKET_NAME'],
        Key=s3_key,
        Body=json.dumps({
            'analysis': analysis,
            'context': event,
            'timestamp': timestamp
        })
    )
    
    # Send notification
    sns.publish(
        TopicArn=os.environ['SNS_TOPIC_ARN'],
        Subject=f'Pipeline Failure Analysis - {repository}',
        Message=f"""
Pipeline Failure Analysis

Repository: {repository}
Commit: {commit}
Workflow: {workflow_name}
Event: {event_name}

Analysis has been saved to S3: {s3_key}

Summary:
{analysis[:500]}... (truncated)

View full analysis in S3 or check the GitHub PR comments.
        """
    )
    
    return {
        'statusCode': 200,
        'analysis': analysis,
        's3Location': f's3://{os.environ["S3_BUCKET_NAME"]}/{s3_key}'
    }
