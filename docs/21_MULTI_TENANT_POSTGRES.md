# Multi-Tenant Postgres Schema

## Overview

This document outlines the additional PostgreSQL tables and infrastructure needed for VYBE's multi-tenant subscription system, beyond the LangGraph checkpoint tables (which are already implemented in Phase 1).

The checkpoint tables (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`) handle conversation persistence and are already user-scoped via `userId::taskId` thread IDs. This document covers the additional tables needed for user management, authentication, and subscriptions.

## Architecture Overview

### Current State (Phase 1)
- ✅ **Checkpoint Tables**: Already implemented and user-scoped
- ✅ **User ID System**: `getUserId()` with `setVybeAccountUserId()` hook ready
- ✅ **Thread Isolation**: All checkpoints use `userId::taskId` format

### Future State (Additional Tables Needed)
- 🔲 **User Management**: Core user accounts
- 🔲 **Stripe Integration**: Subscription management
- 🔲 **Authentication**: VYBE IDE session management
- 🔲 **Usage Tracking**: Token usage, API calls, feature limits
- 🔲 **Billing**: Invoice history, payment methods

## Required Tables

### 1. Users Table

Core user account information.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active', -- active, suspended, deleted
  metadata JSONB DEFAULT '{}'::jsonb -- Additional user preferences, settings
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);
```

**Fields:**
- `id`: Primary key, used as `userId` in checkpoint thread IDs
- `email`: Unique identifier for login
- `email_verified`: Email verification status
- `status`: Account status (active, suspended, deleted)
- `metadata`: Flexible JSON for user preferences, workspace settings, etc.

### 2. Stripe Subscriptions Table

Manages Stripe subscription data and plan tiers.

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_price_id VARCHAR(255), -- Stripe Price ID for the plan
  status VARCHAR(50) NOT NULL, -- active, canceled, past_due, trialing, unpaid, incomplete
  plan_tier VARCHAR(50) NOT NULL, -- free, pro, enterprise
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_plan_tier ON subscriptions(plan_tier);
```

**Fields:**
- `user_id`: Foreign key to users table
- `stripe_customer_id`: Stripe customer identifier
- `stripe_subscription_id`: Stripe subscription identifier
- `status`: Current subscription status from Stripe
- `plan_tier`: VYBE plan tier (free, pro, enterprise)
- `current_period_start/end`: Billing period dates
- `cancel_at_period_end`: Whether subscription will cancel at period end

### 3. Stripe Payment Methods Table

Stores payment methods associated with Stripe customers.

```sql
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL, -- card, bank_account, etc.
  is_default BOOLEAN DEFAULT FALSE,
  card_brand VARCHAR(50), -- visa, mastercard, amex, etc.
  card_last4 VARCHAR(4),
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX idx_payment_methods_stripe_customer_id ON payment_methods(stripe_customer_id);
CREATE INDEX idx_payment_methods_is_default ON payment_methods(is_default);
```

### 4. Stripe Invoices Table

Historical invoice records from Stripe.

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_invoice_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  amount_paid INTEGER NOT NULL, -- Amount in cents
  amount_due INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(50) NOT NULL, -- paid, open, void, uncollectible
  invoice_pdf_url TEXT,
  hosted_invoice_url TEXT,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_stripe_invoice_id ON invoices(stripe_invoice_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_created_at ON invoices(created_at);
```

### 5. VYBE IDE Sessions Table

Manages authentication sessions for VYBE IDE.

```sql
CREATE TABLE vybe_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  refresh_token VARCHAR(255) UNIQUE,
  device_id VARCHAR(255), -- Device identifier (machine hash)
  device_name VARCHAR(255), -- User-friendly device name
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  refresh_expires_at TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP, -- For manual revocation
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_vybe_sessions_user_id ON vybe_sessions(user_id);
CREATE INDEX idx_vybe_sessions_session_token ON vybe_sessions(session_token);
CREATE INDEX idx_vybe_sessions_expires_at ON vybe_sessions(expires_at);
CREATE INDEX idx_vybe_sessions_device_id ON vybe_sessions(device_id);
```

**Fields:**
- `session_token`: JWT or session token for IDE authentication
- `refresh_token`: Token for refreshing sessions
- `device_id`: Machine identifier (matches `getUserId()` fallback logic)
- `expires_at`: Session expiration timestamp
- `revoked_at`: Manual session revocation

### 6. Usage Tracking Table

Tracks API usage, token consumption, and feature limits per user.

```sql
CREATE TABLE usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL, -- Daily aggregation
  metric_type VARCHAR(50) NOT NULL, -- tokens, api_calls, tool_calls, storage_bytes
  metric_value BIGINT NOT NULL DEFAULT 0,
  plan_tier VARCHAR(50) NOT NULL, -- Snapshot of plan tier at time of usage
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional context (model used, tool type, etc.)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date, metric_type)
);

CREATE INDEX idx_usage_tracking_user_id ON usage_tracking(user_id);
CREATE INDEX idx_usage_tracking_date ON usage_tracking(date);
CREATE INDEX idx_usage_tracking_metric_type ON usage_tracking(metric_type);
CREATE INDEX idx_usage_tracking_user_date ON usage_tracking(user_id, date);
```

**Fields:**
- `date`: Daily aggregation date
- `metric_type`: Type of usage (tokens, api_calls, tool_calls, storage_bytes)
- `metric_value`: Aggregated value for the day
- `plan_tier`: Snapshot of user's plan tier (for historical analysis)

### 7. Feature Limits Table

Defines feature limits per plan tier.

```sql
CREATE TABLE feature_limits (
  plan_tier VARCHAR(50) PRIMARY KEY,
  max_tokens_per_month BIGINT,
  max_api_calls_per_month INTEGER,
  max_tool_calls_per_month INTEGER,
  max_storage_bytes BIGINT,
  max_concurrent_sessions INTEGER,
  allowed_models TEXT[], -- Array of allowed model IDs
  features JSONB DEFAULT '{}'::jsonb, -- Feature flags (codebase_search: true, etc.)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default plan tiers
INSERT INTO feature_limits (plan_tier, max_tokens_per_month, max_api_calls_per_month, max_tool_calls_per_month, max_storage_bytes, max_concurrent_sessions, allowed_models, features) VALUES
('free', 100000, 100, 50, 1073741824, 1, ARRAY['gpt-4o-mini'], '{"codebase_search": false, "advanced_reasoning": false}'::jsonb),
('pro', 10000000, 10000, 5000, 10737418240, 5, ARRAY['gpt-4o', 'gpt-4o-mini', 'gpt-5.2', 'claude-3-5-sonnet'], '{"codebase_search": true, "advanced_reasoning": true}'::jsonb),
('enterprise', 100000000, 100000, 50000, 107374182400, 50, ARRAY['gpt-4o', 'gpt-4o-mini', 'gpt-5.2', 'claude-3-5-sonnet', 'claude-3-7-sonnet'], '{"codebase_search": true, "advanced_reasoning": true, "custom_models": true}'::jsonb);
```

### 8. Webhooks Table

Stores Stripe webhook events for audit and debugging.

```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL, -- customer.subscription.created, invoice.paid, etc.
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  payload JSONB NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_stripe_event_id ON webhook_events(stripe_event_id);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at);
```

## Integration Points

### 1. User ID Flow

When a user logs in:

```typescript
// 1. Authenticate user (via Supabase Auth, OAuth, etc.)
const user = await authenticateUser(email, password);

// 2. Set VYBE account user ID
import { setVybeAccountUserId } from 'vs/workbench/services/indexing/common/namespaceUtils';
setVybeAccountUserId(user.id); // UUID from users table

// 3. All future checkpoints automatically use this userId
// Thread IDs will be: `${user.id}::${taskId}`
```

### 2. Subscription Check

Before allowing agent execution:

```typescript
async function checkSubscriptionAccess(userId: string): Promise<boolean> {
  const subscription = await db.query(`
    SELECT status, plan_tier, current_period_end
    FROM subscriptions
    WHERE user_id = $1
    AND status = 'active'
    AND current_period_end > NOW()
  `, [userId]);

  if (!subscription.rows.length) {
    return false; // No active subscription
  }

  // Check feature limits
  const limits = await db.query(`
    SELECT * FROM feature_limits WHERE plan_tier = $1
  `, [subscription.rows[0].plan_tier]);

  return limits.rows[0]; // Return limits for enforcement
}
```

### 3. Usage Tracking

Track usage after each agent execution:

```typescript
async function trackUsage(
  userId: string,
  tokens: number,
  apiCalls: number,
  toolCalls: number
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Get current plan tier
  const subscription = await getActiveSubscription(userId);
  const planTier = subscription?.plan_tier || 'free';

  // Upsert usage for today
  await db.query(`
    INSERT INTO usage_tracking (user_id, date, metric_type, metric_value, plan_tier)
    VALUES ($1, $2, 'tokens', $3, $4),
           ($1, $2, 'api_calls', $5, $4),
           ($1, $2, 'tool_calls', $6, $4)
    ON CONFLICT (user_id, date, metric_type)
    DO UPDATE SET metric_value = usage_tracking.metric_value + EXCLUDED.metric_value
  `, [userId, today, tokens, planTier, apiCalls, toolCalls]);
}
```

## Row-Level Security (RLS)

For additional security, enable Supabase RLS policies:

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vybe_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Example: Users can only see their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Similar policies for other tables...
```

## Migration Strategy

### Phase 1: Core Tables (Priority 1)
1. `users` - Core user accounts
2. `vybe_sessions` - Authentication
3. `subscriptions` - Basic subscription tracking

### Phase 2: Stripe Integration (Priority 2)
4. `payment_methods` - Payment methods
5. `invoices` - Invoice history
6. `webhook_events` - Webhook processing

### Phase 3: Usage & Limits (Priority 3)
7. `usage_tracking` - Usage metrics
8. `feature_limits` - Plan tier limits

## Notes

- **Checkpoint Tables**: Already implemented and user-scoped. No changes needed.
- **User ID Format**: Use UUID from `users.id` as `userId` in thread IDs.
- **Backward Compatibility**: Existing checkpoints with machine-local IDs (`fcb7bb84`) will continue to work. Migration can be done later if needed.
- **Supabase Integration**: All tables should be created in the same Supabase Postgres database as checkpoint tables.
- **Connection Pooling**: Reuse the existing PostgresSaver connection pool or create a separate pool for these tables.

## Future Enhancements

- **Workspace Management**: Tables for shared workspaces, team collaboration
- **API Keys**: User-generated API keys for programmatic access
- **Audit Logs**: Comprehensive audit trail for compliance
- **Analytics**: Aggregated analytics tables for business intelligence
- **Notifications**: User notification preferences and history
