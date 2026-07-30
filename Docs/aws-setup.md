# Cortex — AWS Setup

This is the one-time setup of the AWS resources Cortex needs
in production. Run it once per environment (production,
staging, etc.). The deployment script and the application
itself assume every resource described here already exists.

> **Conventions**
> * All commands assume the AWS CLI v2 with an operator
>   profile that can create the resources listed.
> * Region: `us-east-1` is used throughout. Swap for the
>   region you actually operate in.
> * Naming: `cortex-prod-*` for production, `cortex-staging-*`
>   for staging. Replace the prefix as appropriate.
> * Account ID: replace `111122223333` with your own.

---

## 1. The big picture

```
Operator ─► AWS CLI ─► (this guide) ─► AWS account
                                       │
                                       ├── EC2 instance (cortex-prod-app)
                                       │     └── IAM instance role
                                       │           ├── s3:* on cortex-documents-*
                                       │           └── secretsmanager:GetSecretValue
                                       ├── S3 bucket (cortex-documents-prod)
                                       │     └── Bucket policy (private; EC2 role only)
                                       ├── Secrets Manager (cortex/prod/*)
                                       ├── Security group (cortex-prod-sg)
                                       └── (optional) ALB + ACM certificate + Route 53
```

The trade-off called out in `cortex-engineering-blueprint.md`
is: **everything in one account, one region, no managed
databases, no managed containers**. The first operational
pain that justifies migrating any single component out of
this list is the trigger for a V9 hardening push.

---

## 2. Identity & access (IAM)

### 2.1 The EC2 instance role

The EC2 host assumes a single role; everything else (S3, Secrets
Manager) is granted to that role. No static AWS keys are ever
stored on the host.

```bash
# Create the role + instance profile
aws iam create-role \
    --role-name cortex-prod-app-role \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": { "Service": "ec2.amazonaws.com" },
            "Action": "sts:AssumeRole"
        }]
    }'

aws iam create-instance-profile \
    --instance-profile-name cortex-prod-app-profile
aws iam add-role-to-instance-profile \
    --instance-profile-name cortex-prod-app-profile \
    --role-name cortex-prod-app-role
```

### 2.2 Inline policy — S3

The application reads, writes, and deletes objects under a
prefix scoped to the bucket. The prefix is enforced in code
(`generate_document_uri` in `s3_storage.py`) and the IAM
policy enforces it again at the AWS level.

```bash
cat > /tmp/cortex-s3-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucketForApplicationPrefix",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::cortex-documents-prod",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["tenants/*"]
        }
      }
    },
    {
      "Sid": "ObjectReadWriteUnderTenantsPrefix",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObjectVersion"
      ],
      "Resource": "arn:aws:s3:::cortex-documents-prod/tenants/*"
    }
  ]
}
EOF

aws iam put-role-policy \
    --role-name cortex-prod-app-role \
    --policy-name cortex-prod-s3 \
    --policy-document file:///tmp/cortex-s3-policy.json
```

### 2.3 Inline policy — Secrets Manager

Only the secrets the application actually needs are readable.
This is "least privilege" in the strict sense: a compromised
worker cannot read unrelated secrets in the same account.

```bash
cat > /tmp/cortex-sm-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadApplicationSecrets",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:111122223333:secret:cortex/prod/SECRET_KEY-*",
        "arn:aws:secretsmanager:us-east-1:111122223333:secret:cortex/prod/OPENAI_API_KEY-*",
        "arn:aws:secretsmanager:us-east-1:111122223333:secret:cortex/prod/POSTGRES_PASSWORD-*",
        "arn:aws:secretsmanager:us-east-1:111122223333:secret:cortex/prod/S3_BUCKET-*"
      ]
    }
  ]
}
EOF

aws iam put-role-policy \
    --role-name cortex-prod-app-role \
    --policy-name cortex-prod-secrets \
    --policy-document file:///tmp/cortex-sm-policy.json
```

`POSTGRES_USER`, `POSTGRES_DB`, and the AWS region are read by
`deploy.sh` on the host itself (not by the application), so
they are read by *whatever* credential the host uses to call
the AWS CLI. The instance role grants that too via the same
policy — the deployment script's own list of `arn:` entries
adds those three on top.

### 2.4 The deploy role (for the CD pipeline)

The CD pipeline uses an SSH key to log in to the host (not an
AWS API). No deploy IAM role is strictly required for the
V5 layout. If you later swap to ECS or SSM-based deploys, the
role you create here is the one that gets `ecs:UpdateService`
or `ssm:SendCommand`.

---

## 3. S3

```bash
# Create the bucket. ``--object-ownership BucketOwnerEnforced``
# disables ACLs entirely; access is controlled by IAM and the
# bucket policy only. This is the recommended 2026 setting.
aws s3api create-bucket \
    --bucket cortex-documents-prod \
    --region us-east-1 \
    --object-ownership BucketOwnerEnforced

# Block all public access. Defence in depth: even a mistaken
# bucket policy cannot accidentally expose the corpus.
aws s3api put-public-access-block \
    --bucket cortex-documents-prod \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Default encryption (SSE-S3 / AES-256). KMS is overkill for
# the demo; switch to ``aws:kms`` if compliance requires it.
aws s3api put-bucket-encryption \
    --bucket cortex-documents-prod \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Versioning — cheap insurance against accidental deletes.
aws s3api put-bucket-versioning \
    --bucket cortex-documents-prod \
    --versioning-configuration Status=Enabled

# Lifecycle: non-current versions expire after 30 days. This
# caps the cost of a "delete then re-create" loop without
# losing data permanently.
cat > /tmp/cortex-s3-lifecycle.json <<'EOF'
{
  "Rules": [
    {
      "ID": "expire-noncurrent",
      "Status": "Enabled",
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
    }
  ]
}
EOF
aws s3api put-bucket-lifecycle-configuration \
    --bucket cortex-documents-prod \
    --lifecycle-configuration file:///tmp/cortex-s3-lifecycle.json
```

The bucket policy is the *implicit* "deny everything except
the instance role" model. The IAM policy in §2.2 already
grants the role access; no bucket policy is required. If you
want belt-and-braces, add a bucket policy that explicitly
denies any principal not on the allow-list:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAllExceptAppRole",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::cortex-documents-prod",
        "arn:aws:s3:::cortex-documents-prod/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalArn": "arn:aws:iam::111122223333:role/cortex-prod-app-role"
        }
      }
    }
  ]
}
```

---

## 4. Secrets Manager

Each secret is a separate `SecretString` value, not a single
JSON blob. The reason: per-secret IAM scoping (§2.3) is much
easier when each value is its own ARN. The cost of one extra
secret in Secrets Manager is rounding error; the operational
benefit of "I can rotate just the OpenAI key" is large.

```bash
# Generate strong random values for the things the
# application does not already have a value for.
SECRET_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)

# Required by the application (see scripts/start.sh).
for name in SECRET_KEY OPENAI_API_KEY POSTGRES_PASSWORD S3_BUCKET; do
    aws secretsmanager create-secret \
        --name "cortex/prod/${name}" \
        --description "Cortex production ${name}" \
        --secret-string "${!name}"
done

# Required by deploy.sh on the host (it sets up the
# postgres container before the api starts).
for name in POSTGRES_USER POSTGRES_DB AWS_REGION; do
    value="${name}=prod"
    case "$name" in
        POSTGRES_USER) value=cortex ;;
        POSTGRES_DB)   value=cortex ;;
        AWS_REGION)    value=us-east-1 ;;
    esac
    aws secretsmanager create-secret \
        --name "cortex/prod/${name}" \
        --description "Cortex production ${name} (host-side)" \
        --secret-string "${value}"
done
```

To rotate a secret:

```bash
# Generate a new value
NEW=$(openssl rand -hex 32)

# Update the secret. ``--secret-string`` overwrites the value
# in place; any container that re-fetches (i.e. restarts) will
# see the new value. The application does not hot-reload.
aws secretsmanager put-secret-value \
    --secret-id cortex/prod/SECRET_KEY \
    --secret-string "${NEW}"

# Restart the api + worker to pick up the new value.
docker compose -f Docker/docker-compose.prod.yml restart api worker
```

There is no Secrets Manager rotation Lambda in the V5 setup.
A rotation Lambda is a V9 hardening item.

---

## 5. Networking — security groups + Elastic IP

```bash
# Allocate an Elastic IP. The host's public IP is stable
# across reboots, which is what the ALB target group needs
# (and what DNS needs to point at, if you skip the ALB).
aws ec2 allocate-address \
    --domain vpc \
    --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=cortex-prod-eip}]'

# Create the security group. Default: deny all inbound
# except SSH (from your IP only) and HTTP/HTTPS (from
# anywhere; the ALB is in front so 0.0.0.0/0 on 80/443 is
# fine for a demo).
SG_ID=$(aws ec2 create-security-group \
    --group-name cortex-prod-sg \
    --description "Cortex production host" \
    --output text --query GroupId)

# SSH — restrict to your office / VPN CIDR. Replace
# ``203.0.113.0/24`` with the real network you operate from.
aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID --protocol tcp --port 22 \
    --cidr 203.0.113.0/24

# HTTP/HTTPS — open to the world; the ALB does the source-IP
# filtering, and a TLS-only :443 listener can replace this
# once a certificate is in place.
aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0

# (Optional) If you front the host directly with your own
# DNS (no ALB), restrict 80/443 to a known health-check
# range or your own edge IPs. The 0.0.0.0/0 default is the
# pragmatic choice for a demo.
```

No outbound rules are added — the default VPC security group
allows all egress, which is what the host needs to reach S3,
Secrets Manager, OpenAI, and the package registries.

---

## 6. EC2

The blueprint's V5 trade-off says "start on plain EC2 with
self-managed Postgres, only migrate when an operational pain
names itself". The instance type for a single-tenant demo is
`t3.small` (2 GB RAM, 2 vCPU). Scale up to `t3.medium` or
`t3.large` once you can name the specific load that needs it.

```bash
# Find the latest Amazon Linux 2023 AMI in us-east-1.
AMI=$(aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=al2023-ami-2023.*-x86_64" \
              "Name=state,Values=available" \
    --query "reverse(sort_by(Images, &CreationDate))[0].ImageId" \
    --output text)

# User-data script: install Docker + AWS CLI on first boot.
# The host's *only* bootstrap; everything after this is
# handled by the deployment pipeline.
cat > /tmp/user-data.sh <<'EOF'
#!/bin/bash
set -e
yum update -y
yum install -y docker awscli
systemctl enable --now docker
usermod -aG docker ec2-user

# Docker Compose v2 plugin
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64 \
     -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Project directory + clone (the operator's public SSH key
# must already be in the deploy key list of the repo).
mkdir -p /opt/cortex
chown ec2-user:ec2-user /opt/cortex
EOF

# Launch. The IAM instance profile is what gives the host
# access to S3 + Secrets Manager; everything else flows from
# the policies in §2.
aws ec2 run-instances \
    --image-id $AMI \
    --instance-type t3.small \
    --security-group-ids $SG_ID \
    --iam-instance-profile Name=cortex-prod-app-profile \
    --user-data file:///tmp/user-data.sh \
    --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":40,"VolumeType":"gp3","Encrypted":true,"DeleteOnTermination":true}}]' \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=cortex-prod-app}]' \
    --metadata-options 'HttpTokens=required,HttpEndpoint=enabled,HttpPutResponseHopLimit=2' \
    --query 'Instances[0].InstanceId' --output text
```

Notes on the choices made here:

* **EBS encryption at rest** is enabled on the root volume.
  This pairs with the S3 SSE-S3 encryption to give end-to-end
  encryption-at-rest without managing any KMS keys.
* **IMDSv2 required** (`HttpTokens=required`) is a security
  baseline — IMDSv1 is the source of the classic "SSRF →
  AWS credential theft" vulnerability class.
* **40 GB gp3 root volume** is a starting point. The V5
  stack is small (Postgres + the application); 40 GB gives
  room for several months of audit log and a few thousand
  small documents before needing an expansion.
* **No public IP at launch** — the Elastic IP is associated
  after launch. This makes the IP a separate resource the
  operator can re-attach to a replacement instance.

```bash
# Associate the Elastic IP with the running instance
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=cortex-prod-app" \
              "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].InstanceId" --output text)

EIP_ALLOC=$(aws ec2 describe-addresses \
    --filters "Name=tag:Name,Values=cortex-prod-eip" \
    --query "Addresses[0].AllocationId" --output text)

aws ec2 associate-address \
    --instance-id $INSTANCE_ID \
    --allocation-id $EIP_ALLOC
```

---

## 7. (Optional) ALB + ACM + Route 53

The ALB is the right shape for "cloud-hosted public URL",
but adds a moving part. For a single-host demo, you can
skip this section and point DNS directly at the Elastic IP.
The application is configured to honour `X-Forwarded-Proto`
either way.

```bash
# 1. Request a public certificate in ACM for the real
#    public hostname (e.g. api.cortex.example.com).
aws acm request-certificate \
    --domain-name api.cortex.example.com \
    --validation-method DNS \
    --region us-east-1
# Note the ``CertificateArn`` from the output. Add the
# CNAME records the CLI returns to your DNS zone in
# Route 53 to complete the validation.

# 2. Create the ALB. Two public subnets in different AZs
#    are the standard pattern; for a single-host demo the
#    ALB in one subnet is fine.
VPC_ID=$(aws ec2 describe-vpcs --query "Vpcs[0].VpcId" --output text)
SUBNET_IDS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" \
              "Name=default-for-az,Values=true" \
    --query "Subnets[].SubnetId" --output text | tr '\t' ' ')

ALB_ARN=$(aws elbv2 create-load-balancer \
    --name cortex-prod-alb \
    --type application \
    --subnets $SUBNET_IDS \
    --security-groups $SG_ID \
    --query "LoadBalancers[0].LoadBalancerArn" --output text)

# 3. Target group pointing at the EC2 on port 8000 (the
#    api's debug port mapping is on the host loopback;
#    the target group should hit nginx on :80 instead).
#    The healthcheck path is /health.
TG_ARN=$(aws elbv2 create-target-group \
    --name cortex-prod-tg \
    --protocol HTTP --port 80 \
    --vpc-id $VPC_ID \
    --health-check-path /health \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --query "TargetGroups[0].TargetGroupArn" --output text)

aws elbv2 register-targets \
    --target-group-arn $TG_ARN \
    --targets "Id=$INSTANCE_ID"

# 4. Listeners: :80 redirects to :443, :443 terminates TLS.
CERT_ARN=<paste the ACM cert ARN from step 1>
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP --port 80 \
    --default-actions "Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}"

aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTPS --port 443 \
    --certificates CertificateArn=$CERT_ARN \
    --default-actions "Type=forward,TargetGroupArn=$TG_ARN"

# 5. Route 53 alias record pointing api.cortex.example.com
#    at the ALB.
ZONE_ID=$(aws route53 list-hosted-zones \
    --query "HostedZones[?Name=='cortex.example.com.'].Id" \
    --output text)

aws route53 change-resource-record-sets \
    --hosted-zone-id $ZONE_ID \
    --change-batch '{
        "Changes": [{
            "Action": "CREATE",
            "ResourceRecordSet": {
                "Name": "api.cortex.example.com",
                "Type": "A",
                "AliasTarget": {
                    "HostedZoneId": "<ALB hosted zone id; visible in the elbv2 describe-load-balancers output>",
                    "DNSName": "'$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query "LoadBalancers[0].DNSName" --output text)'",
                    "EvaluateTargetHealth": true
                }
            }
        }]
    }'
```

---

## 8. Verifying the setup

The shortest path to "is the platform actually up" is, in
order:

```bash
# 1. The host is reachable
ssh ec2-user@<elastic-ip> 'docker compose version && aws --version'

# 2. The instance role works
ssh ec2-user@<elastic-ip> 'aws sts get-caller-identity'
# The ``Arn`` should mention ``cortex-prod-app-role``.

# 3. The secret is readable
ssh ec2-user@<elastic-ip> 'aws secretsmanager get-secret-value --secret-id cortex/prod/SECRET_KEY --query SecretString --output text | head -c 16 && echo'

# 4. S3 is reachable with the role
ssh ec2-user@<elastic-ip> 'aws s3 ls s3://cortex-documents-prod/'
# Empty bucket → empty list, but the call must succeed.

# 5. The api is healthy through nginx
curl -s http://<elastic-ip>/health
# {"status":"ok"}

# 6. The ALB is healthy (if set up)
curl -s https://api.cortex.example.com/health
# {"status":"ok"}
```

If any of these fail, the most common cause is the IAM role
not being attached at launch. Tear down the instance and
re-launch with the correct `IamInstanceProfile` argument.

---

## 9. The "what if I lose the host" runbook

The host is intentionally disposable. Everything that
matters — application code, secrets, document blobs — is
elsewhere. The recovery procedure is:

1. Launch a new EC2 with the same user-data, the same
   security group, and the same instance profile.
2. Re-attach the Elastic IP (or update Route 53 to point
   at the new instance's public DNS).
3. Re-run the first-time bootstrap block from
   `deployment.md` §2.
4. The new instance pulls the same image, the same secrets,
   and the same S3 bucket; the platform is back.

The only thing this runbook does not cover is the local
postgres volume. The host's named volume is bound to the
instance; replacing the instance loses it. **The backup
procedure (`backup.md`) is mandatory in production for
this reason.**
