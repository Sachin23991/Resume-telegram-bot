# AWS 24/7 Deployment (ECS Fargate)

This guide deploys the bot as a container on AWS ECS Fargate so it runs continuously.

## Why ECS Fargate

- Always-on service (no sleep)
- Automatic restarts if container crashes
- No server management
- Works with this bot's long-polling Telegram setup

## 1. Prerequisites

- AWS account
- AWS CLI configured (`aws configure`)
- Docker installed
- Existing MongoDB Atlas connection string and all API keys

## 2. Create ECR repository

```bash
aws ecr create-repository --repository-name cv-analyzer-bot
```

Get your AWS account ID and region (replace values in later commands):

```bash
aws sts get-caller-identity
aws configure get region
```

## 3. Build and push image

```bash
# from project root
docker build -t cv-analyzer-bot:latest .

# replace <ACCOUNT_ID> and <REGION>
aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com

docker tag cv-analyzer-bot:latest <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/cv-analyzer-bot:latest
docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/cv-analyzer-bot:latest
```

## 4. Create CloudWatch logs group

```bash
aws logs create-log-group --log-group-name /ecs/cv-analyzer-bot
```

## 5. Create ECS cluster

```bash
aws ecs create-cluster --cluster-name cv-analyzer-cluster
```

## 6. Create task definition

Create file `taskdef.json` locally with your values:

```json
{
  "family": "cv-analyzer-bot",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "cv-analyzer-bot",
      "image": "<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/cv-analyzer-bot:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "TELEGRAM_BOT_TOKEN", "value": "<VALUE>" },
        { "name": "MONGODB_URL", "value": "<VALUE>" },
        { "name": "MONGODB_DB_NAME", "value": "<VALUE>" },
        { "name": "OPENROUTER_KEY_1", "value": "<VALUE>" },
        { "name": "OPENROUTER_KEY_2", "value": "<VALUE>" },
        { "name": "OPENROUTER_KEY_3", "value": "<VALUE>" },
        { "name": "OPENROUTER_KEY_FALLBACK", "value": "<VALUE>" },
        { "name": "GEMINI_API_KEY", "value": "<VALUE>" },
        { "name": "APILAYER_KEY_1", "value": "<VALUE>" },
        { "name": "APILAYER_KEY_2", "value": "<VALUE>" },
        { "name": "APILAYER_KEY_3", "value": "<VALUE>" },
        { "name": "APILAYER_KEY_4", "value": "<VALUE>" },
        { "name": "CVPARSER_KEY_1", "value": "<VALUE>" },
        { "name": "CVPARSER_KEY_2", "value": "<VALUE>" },
        { "name": "CVPARSER_KEY_3", "value": "<VALUE>" },
        { "name": "CVPARSER_KEY_4", "value": "<VALUE>" },
        { "name": "CVPARSER_API_URL", "value": "https://api.cvparser-api.com/graphql" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/cv-analyzer-bot",
          "awslogs-region": "<REGION>",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

Register task definition:

```bash
aws ecs register-task-definition --cli-input-json file://taskdef.json
```

## 7. Create service (desired count = 1)

Use subnets/security groups from your VPC:

```bash
aws ecs create-service \
  --cluster cv-analyzer-cluster \
  --service-name cv-analyzer-service \
  --task-definition cv-analyzer-bot \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-aaa,subnet-bbb],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

## 8. Verify it is live

```bash
aws ecs describe-services --cluster cv-analyzer-cluster --services cv-analyzer-service
aws ecs list-tasks --cluster cv-analyzer-cluster --service-name cv-analyzer-service
aws logs tail /ecs/cv-analyzer-bot --follow
```

You should see logs including:

- `HTTP server listening on port 3000`
- `Bot is running!`

## Updating after code changes

```bash
docker build -t cv-analyzer-bot:latest .
docker tag cv-analyzer-bot:latest <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/cv-analyzer-bot:latest
docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/cv-analyzer-bot:latest

aws ecs update-service --cluster cv-analyzer-cluster --service cv-analyzer-service --force-new-deployment
```

## Cost and uptime notes

- Fargate is paid but does not sleep, so your bot stays online 24/7.
- Keep desired count at `1` for one bot instance (prevents duplicate polling workers).
- Store secrets in AWS Secrets Manager or SSM Parameter Store for production hardening.
