import json
import boto3
import os

bedrock = boto3.client('bedrock-runtime')

def analyze_code_changes(changes):
    prompt = f"""
    Analyze the following code changes for potential risks and issues:
    {changes}
    
    Consider the following aspects:
    1. Security vulnerabilities
    2. Performance impacts
    3. Integration issues
    4. Data privacy concerns
    5. Compliance requirements
    
    Provide a detailed risk assessment with recommendations.
    """
    
    response = bedrock.invoke_model(
        modelId='anthropic.claude-v2',
        body=json.dumps({
            "prompt": prompt,
            "max_tokens_to_sample": 1000,
            "temperature": 0.5,
            "top_p": 0.9,
        })
    )
    
    return json.loads(response['body'].read())['completion']

def handler(event, context):
    try:
        # Extract code changes from the event
        code_changes = event.get('code_changes', '')
        
        # Perform risk assessment
        risk_assessment = analyze_code_changes(code_changes)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'risk_assessment': risk_assessment
            })
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        } 