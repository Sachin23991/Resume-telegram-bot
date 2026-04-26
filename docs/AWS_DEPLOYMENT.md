# AWS ECS Fargate Deployment Guide

This guide provides step-by-step instructions for deploying the CV Analyzer Bot on AWS ECS Fargate for 24/7 always-on operation.

## Table of Contents

- [Why ECS Fargate](#why-ecs-fargate)
- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Step 1: Create ECR Repository](#step-1-create-ecr-repository)
- [Step 2: Build and Push Docker Image](#step-2-build-and-push-docker-image)
- [Step 3: Create CloudWatch Logs Group](#step-3-create-cloudwatch-logs-group)
- [Step 4: Create ECS Cluster](#step-4-create-ecs-cluster)
- [Step 5: Create Task Definition](#step-5-create-task-definition)
- [Step 6: Create Service](#step-6-create-service)
- [Step 7: Verify Deployment](#step-7-verify-deployment)
- [Updating After Code Changes](#updating-after-code-changes)
- [Cost and Uptime Notes](#cost-and-uptime-notes)
- [Troubleshooting](#troubleshooting)

---

## Why ECS Fargate

| Feature | Benefit |
|---------|---------|
| **Always-on** | No sleep - bot runs 24/7 |
| **Automatic Restarts** | Container restarts if it crashes |
| **No Server Management** | AWS manages infrastructure |
| **Long Polling Support** | Perfect for Telegram bot polling mode |
| **Scalable** | Easy to scale if needed |
| **Pay-per-use** | Only pay for running time |

---

## Prerequisites

Before starting, ensure you have:

- AWS account with billing enabled
- AWS CLI installed and configured (`aws configure`)
- Docker installed locally
- All API keys and MongoDB connection string ready
- IAM user with ECS, ECR, and CloudWatch permissions

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  AWS ECS Fargate Architecture                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    ECS Cluster                           │   │
│  │  ┌───────────────────────────────────────────────────┐   │   │
│  │  │               Task Definition                      │   │   │
│  │  │  ┌─────────────────────────────────────────────┐  │   │   │
│  │  │  │           Container: cv-analyzer-bot         │  │   │   │
│  │  │  │  - Image: ECR/cv-analyzer-bot:latest        │  │   │   │
│  │  │  │  - CPU: 0.5 vCPU                            │  │   │   │
│  │  │  │  - Memory: 1 GB                             │  │   │   │
│  │  │  │  - Port: 3000                               │  │   │   │
│  │  │  │  - Env Vars: All API keys, MongoDB          │  │   │   │
│  │  │  │  - Logs: CloudWatch                         │  │   │   │
│  │  │  └─────────────────────────────────────────────┘  │   │   │
│  │  └───────────────────────────────────────────────────┘   │   │
│  │                                                           │   │
│  │  ┌───────────────────────────────────────────────────┐   │   │
│  │  │              Service: cv-analyzer-service          │   │   │
│  │  │  - Desired Count: 1                               │   │   │
│  │  │  - Launch Type: FARGATE                           │   │   │
│  │  │  - Network: awsvpc                                │   │   │
│  │  └───────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  External Connections:                                          │
│  ├──► Telegram API (polling)                                   │
│  ├──► MongoDB Atlas (database)                                 │
│  ├──► OpenRouter/Gemini/OpenAI (AI APIs)                       │
│  └──► APILayer/CVParser/UseResume (Parser APIs)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Create ECR Repository

```bash
# Create Elastic Container Registry repository
aws ecr create-repository \
  --repository-name cv-analyzer-bot \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability MUTABLE
```

**Expected Output:**
```json
{
  "repository": {
    "repositoryArn": "arn:aws:ecr:REGION:ACCOUNT_ID:repository/cv-analyzer-bot",
    "repositoryUri": "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/cv-analyzer-bot",
    "repositoryName": "cv-analyzer-bot"
  }
}
```

**Save these values:**
- `repositoryUri` - Used for Docker push
- `ACCOUNT_ID` - Your AWS account ID
- `REGION` - Your AWS region

---

## Step 2: Build and Push Docker Image

```bash
# Navigate to project root
cd /path/to/Resume-telegram-bot

# Build Docker image
docker build -t cv-analyzer-bot:latest .

# Get your AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Tag image for ECR
docker tag cv-analyzer-bot:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cv-analyzer-bot:latest

# Push to ECR
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cv-analyzer-bot:latest
```

---

## Step 3: Create CloudWatch Logs Group

```bash
# Create log group for container logs
aws logs create-log-group --log-group-name /ecs/cv-analyzer-bot

# Set log retention to 30 days (optional, saves costs)
aws logs put-retention-policy \
  --log-group-name /ecs/cv-analyzer-bot \
  --retention-in-days 30
```

---

## Step 4: Create ECS Cluster

```bash
# Create ECS cluster
aws ecs create-cluster \
  --cluster-name cv-analyzer-cluster \
  --tags Key=Name,Value=cv-analyzer-cluster
```

---

## Step 5: Create Task Definition

### 5.1: Create IAM Role for Task Execution

```bash
# Create trust policy for ECS task execution role
cat > /tmp/ecs-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file:///tmp/ecs-trust-policy.json

# Attach managed policy for task execution
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

### 5.2: Create Task Definition JSON

Create `taskdef.json` with your values:

```json
{
  "family": "cv-analyzer-bot",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "cv-analyzer-bot",
      "image": "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/cv-analyzer-bot:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" },
        { "name": "TELEGRAM_BOT_TOKEN", "value": "YOUR_BOT_TOKEN" },
        { "name": "MONGODB_URL", "value": "YOUR_MONGODB_URL" },
        { "name": "MONGODB_DB_NAME", "value": "cv-analyzer" },
        { "name": "OPENROUTER_KEY_1", "value": "YOUR_OPENROUTER_KEY_1" },
        { "name": "OPENROUTER_KEY_2", "value": "YOUR_OPENROUTER_KEY_2" },
        { "name": "OPENROUTER_KEY_3", "value": "YOUR_OPENROUTER_KEY_3" },
        { "name": "OPENROUTER_KEY_FALLBACK", "value": "YOUR_OPENROUTER_KEY_FALLBACK" },
        { "name": "GEMINI_API_KEY", "value": "YOUR_GEMINI_KEY" },
        { "name": "OPENAI_API_KEY", "value": "YOUR_OPENAI_KEY" },
        { "name": "APILAYER_KEY_1", "value": "YOUR_APILAYER_KEY_1" },
        { "name": "APILAYER_KEY_2", "value": "YOUR_APILAYER_KEY_2" },
        { "name": "APILAYER_KEY_3", "value": "YOUR_APILAYER_KEY_3" },
        { "name": "APILAYER_KEY_4", "value": "YOUR_APILAYER_KEY_4" },
        { "name": "USERESUME_KEY_1", "value": "YOUR_USERESUME_KEY_1" },
        { "name": "USERESUME_KEY_2", "value": "YOUR_USERESUME_KEY_2" },
        { "name": "USERESUME_KEY_3", "value": "YOUR_USERESUME_KEY_3" },
        { "name": "CVPARSER_KEY_1", "value": "YOUR_CVPARSER_KEY_1" },
        { "name": "CVPARSER_KEY_2", "value": "YOUR_CVPARSER_KEY_2" },
        { "name": "CVPARSER_KEY_3", "value": "YOUR_CVPARSER_KEY_3" },
        { "name": "CVPARSER_KEY_4", "value": "YOUR_CVPARSER_KEY_4" },
        { "name": "CVPARSER_API_URL", "value": "https://api.cvparser-api.com/graphql" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/cv-analyzer-bot",
          "awslogs-region": "YOUR_REGION",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

**Replace placeholders:**
- `ACCOUNT_ID` - Your AWS account ID
- `REGION` / `YOUR_REGION` - Your AWS region (e.g., `us-east-1`)
- All `YOUR_*` values - Your actual API keys

### 5.3: Register Task Definition

```bash
aws ecs register-task-definition --cli-input-json file://taskdef.json
```

---

## Step 6: Create Service

### 6.1: Get VPC Information

```bash
# Get default VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)

# Get subnets in the VPC
SUBNETS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[*].SubnetId" \
  --output text)

# Get default security group
SECURITY_GROUP=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=default" \
  --query "SecurityGroups[0].GroupId" \
  --output text)

echo "VPC: $VPC_ID"
echo "Subnets: $SUBNETS"
echo "Security Group: $SECURITY_GROUP"
```

### 6.2: Create the Service

```bash
# Convert subnets to comma-separated list
SUBNET_LIST=$(echo $SUBNETS | tr ' ' ',')

aws ecs create-service \
  --cluster cv-analyzer-cluster \
  --service-name cv-analyzer-service \
  --task-definition cv-analyzer-bot \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_LIST],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --tags Key=Name,Value=cv-analyzer-service
```

**Important:**
- `--desired-count 1` - Only ONE instance to prevent duplicate Telegram polling
- `assignPublicIp=ENABLED` - Allows outbound internet access for API calls

---

## Step 7: Verify Deployment

### 7.1: Check Service Status

```bash
aws ecs describe-services \
  --cluster cv-analyzer-cluster \
  --services cv-analyzer-service \
  --query "services[0].{Status:status,RunningCount:runningCount,DesiredCount:desiredCount}"
```

**Expected output:**
```json
{
  "Status": "ACTIVE",
  "RunningCount": 1,
  "DesiredCount": 1
}
```

### 7.2: Check Running Tasks

```bash
aws ecs list-tasks \
  --cluster cv-analyzer-cluster \
  --service-name cv-analyzer-service

# Get task details
TASK_ARN=$(aws ecs list-tasks \
  --cluster cv-analyzer-cluster \
  --service-name cv-analyzer-service \
  --query "taskArns[0]" \
  --output text)

aws ecs describe-tasks \
  --cluster cv-analyzer-cluster \
  --tasks $TASK_ARN
```

### 7.3: View Logs

```bash
# Follow logs in real-time
aws logs tail /ecs/cv-analyzer-bot --follow

# Or view last 100 lines
aws logs tail /ecs/cv-analyzer-bot --limit 100
```

**Expected logs:**
```
✅ HTTP server listening on port 3000
📡 Bot is running with long polling...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CV Analyzer Pro is running!
🎯 Listening for messages...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 7.4: Test the Bot

1. Open Telegram
2. Find your bot
3. Send `/start`
4. Bot should respond immediately

---

## Updating After Code Changes

```bash
# 1. Build new image
docker build -t cv-analyzer-bot:latest .

# 2. Tag and push to ECR
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)

docker tag cv-analyzer-bot:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cv-analyzer-bot:latest

docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cv-analyzer-bot:latest

# 3. Force new deployment
aws ecs update-service \
  --cluster cv-analyzer-cluster \
  --service cv-analyzer-service \
  --force-new-deployment

# 4. Watch deployment
aws logs tail /ecs/cv-analyzer-bot --follow
```

---

## Cost and Uptime Notes

### Estimated Monthly Cost (us-east-1)

| Resource | Specification | Cost/Month |
|----------|---------------|------------|
| ECS Fargate | 0.5 vCPU, 1 GB RAM | ~$12-15 |
| CloudWatch Logs | 1 GB/month | ~$0.50 |
| ECR Storage | 1 GB | Free (first 500 MB) |
| **Total** | | **~$13-16/month** |

### Uptime Considerations

- **Fargate does not sleep** - Bot runs 24/7
- **Automatic restarts** - If container crashes, ECS restarts it
- **Health checks** - Container health monitored every 30 seconds
- **Desired count = 1** - Prevents duplicate polling workers

### Cost Optimization

```bash
# Use Graviton (ARM) for ~20% savings
# Update Dockerfile:
FROM --platform=linux/arm64 node:20-alpine

# Update taskdef.json:
"requiresCompatibilities": ["FARGATE"],
"cpu": "256",    # 0.25 vCPU (Graviton)
"memory": "512", # 512 MB (Graviton minimum)
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check task events
aws ecs describe-tasks \
  --cluster cv-analyzer-cluster \
  --tasks $TASK_ARN \
  --query "tasks[0].attachments[0].details"

# Common issues:
# - IAM role missing permissions
# - Environment variable syntax error
# - Image pull failed (ECR permissions)
```

### Bot Not Responding

```bash
# Check if container is running
aws ecs list-tasks \
  --cluster cv-analyzer-cluster \
  --service-name cv-analyzer-service \
  --desired-status RUNNING

# Check logs for errors
aws logs tail /ecs/cv-analyzer-bot --filter-pattern "ERROR"
```

### High Memory Usage

```bash
# Increase memory in taskdef.json
"memory": "2048",  # 2 GB

# Re-register and deploy
aws ecs register-task-definition --cli-input-json file://taskdef.json
aws ecs update-service --cluster cv-analyzer-cluster --service cv-analyzer-service --force-new-deployment
```

### API Rate Limiting

If you see rate limit errors:

1. Add more API keys to rotation
2. Increase backoff delays in code
3. Consider upgrading API tier

---

## Security Best Practices

### Use AWS Secrets Manager (Production)

Instead of plain environment variables:

```json
{
  "secrets": [
    {
      "name": "TELEGRAM_BOT_TOKEN",
      "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:cv-analyzer/token"
    },
    {
      "name": "MONGODB_URL",
      "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:cv-analyzer/mongodb"
    }
  ]
}
```

### Restrict Security Group

```bash
# Only allow outbound traffic
aws ec2 authorize-security-group-egress \
  --group-id $SECURITY_GROUP \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Remove default allow-all rule
aws ec2 revoke-security-group-egress \
  --group-id $SECURITY_GROUP \
  --protocol -1 \
  --cidr 0.0.0.0/0
```

---

## Cleanup

To remove all resources:

```bash
# Delete service
aws ecs delete-service \
  --cluster cv-analyzer-cluster \
  --service cv-analyzer-service \
  --force

# Delete cluster
aws ecs delete-cluster --cluster cv-analyzer-cluster

# Delete task definition (deregister)
aws ecs deregister-task-definition \
  --task-definition cv-analyzer-bot

# Delete ECR repository
aws ecr delete-repository \
  --repository-name cv-analyzer-bot \
  --force

# Delete log group
aws logs delete-log-group --log-group-name /ecs/cv-analyzer-bot

# Delete IAM role (after detaching policies)
aws iam detach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam delete-role --role-name ecsTaskExecutionRole
```
