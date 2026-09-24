// Shapes returned by the Supabase API (tables, views and RPCs).
export type ProfileStatus = 'active' | 'restricted' | 'suspended';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  country: string;
  is_verified: boolean;
  followers_count: number;
  following_count: number;
  posts_count: number;
  status: ProfileStatus;
  created_at: string;
};

export type MiniProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path' | 'is_verified'>;

export type MediaKind = 'image' | 'video';

export type FeedItem = {
  id: string;
  author_id: string;
  kind: MediaKind;
  media_path: string;
  thumb_path: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  caption: string;
  category: string | null;
  status: 'published' | 'review' | 'removed';
  like_count: number;
  comment_count: number;
  save_count: number;
  view_count: number;
  created_at: string;
  author_username: string;
  author_display_name: string;
  author_avatar_path: string | null;
  author_is_verified: boolean;
  liked: boolean;
  saved: boolean;
  following: boolean;
  score: number;
};

export type StoryRailItem = {
  author_id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  is_verified: boolean;
  story_count: number;
  has_unseen: boolean;
  latest_at: string;
};

export type Story = {
  id: string;
  author_id: string;
  kind: MediaKind;
  media_path: string;
  caption: string;
  duration_ms: number | null;
  created_at: string;
  expires_at: string;
};

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: MiniProfile | null;
};

export type NotificationType =
  | 'like' | 'comment' | 'follow' | 'earning' | 'payment' | 'payout' | 'kyc' | 'moderation' | 'security' | 'system';

export type AppNotification = {
  id: string;
  type: NotificationType;
  body: string;
  post_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  actor: MiniProfile | null;
};

export type InboxItem = {
  conversation_id: string;
  other_id: string;
  other_username: string;
  other_display_name: string;
  other_avatar_path: string | null;
  other_is_verified: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_id: string | null;
  unread_count: number;
  can_message: boolean;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type KycStatus = 'PENDING' | 'REVIEW' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
export type BalanceBucket = 'ESTIMATED' | 'PENDING' | 'CONFIRMED' | 'AVAILABLE' | 'PROCESSING' | 'PAID';
export type WithdrawBlocker =
  | 'account_restricted' | 'pro_required' | 'kyc_required' | 'bank_required' | 'bank_unverified'
  | 'bank_cooldown' | 'payout_in_progress' | 'insufficient_available';

type EarningsBreakdown = { ads: number; membership: number; other: number };

export type Monetization = {
  currency: string;
  currency_decimals: number;
  is_pro: boolean;
  subscription: null | {
    plan_id: string;
    plan_name: string;
    status: string;
    channel: 'google_play' | 'app_store' | 'web' | 'sandbox';
    current_period_end: string;
    auto_renew: boolean;
  };
  kyc: { status: KycStatus; rejection_reason: string | null; submitted_at: string | null };
  bank: null | {
    bank_name: string;
    holder_name: string;
    last4: string;
    account_type: 'savings' | 'checking';
    status: 'pending' | 'verified' | 'rejected';
    updated_at: string;
  };
  balances: Record<BalanceBucket, number>;
  earnings: Record<'today' | 'week' | 'month', EarningsBreakdown>;
  last_payout: null | { id: string; amount: number; status: string; requested_at: string };
  payout_min: number;
  withdraw_blockers: WithdrawBlocker[];
};

export type CreatorStats = {
  views: number;
  likes: number;
  comments: number;
  saves: number;
  posts: number;
  followers: number;
  new_followers_7d: number;
  avg_retention: number | null;
  top_posts: Array<Pick<FeedItem, 'id' | 'kind' | 'thumb_path' | 'media_path' | 'view_count' | 'like_count' | 'comment_count'>>;
};

export type Plan = {
  id: string;
  name: string;
  tier: number;
  description: string;
  benefits: string[];
  prices: Record<string, number>;
  google_product_id: string | null;
  apple_product_id: string | null;
};

export type LedgerEntry = {
  id: number;
  tx_id: string;
  currency: string;
  bucket: BalanceBucket | null;
  amount: number;
  entry_type: 'credit' | 'debit' | 'hold' | 'release' | 'payout' | 'refund' | 'adjustment' | 'fee';
  source: string;
  description: string;
  created_at: string;
};

export type Category = { slug: string; name: string; sort: number };

export type AdminRole = 'SUPER_ADMIN' | 'FINANCE' | 'MODERATION' | 'KYC' | 'SUPPORT' | 'ANALYTICS' | 'SECURITY';

export type AdminReport = {
  target_type: 'post' | 'comment' | 'user' | 'message' | 'story';
  target_id: string;
  report_count: number;
  reasons: string[];
  first_reported_at: string;
  owner_id: string | null;
  owner_username: string | null;
  preview_text: string | null;
  preview_media_path: string | null;
  preview_kind: MediaKind | null;
  content_status: string | null;
};

export type AdminKyc = {
  user_id: string;
  username: string;
  legal_name: string;
  document_type: string;
  document_country: string;
  document_last4: string;
  front_path: string;
  back_path: string | null;
  selfie_path: string;
  submitted_at: string;
  duplicate_identity: boolean;
};

export type Appeal = {
  id: string;
  user_id: string;
  target_type: string;
  target_id: string | null;
  message: string;
  status: 'open' | 'accepted' | 'rejected';
  created_at: string;
  resolution: string | null;
};
