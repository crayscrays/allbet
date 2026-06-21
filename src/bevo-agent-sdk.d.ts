/**
 * Ambient type declarations for @bevo/agent-sdk.
 *
 * The SDK is installed from GitHub and ships without a pre-built dist/.
 * TypeScript's moduleResolution:"NodeNext" cannot resolve its exports map
 * until the package is built. These inline declarations let tsc succeed
 * without requiring a prior build step.
 */

declare module "@bevo/agent-sdk" {
  // ── Command & capability schema ────────────────────────────────────────────

  export type CommandOptionType =
    | "user"
    | "string"
    | "integer"
    | "boolean"
    | "token";

  export interface CommandOption {
    name: string;
    type?: CommandOptionType;
    description?: string;
    required?: boolean;
    choices?: string[];
  }

  export interface BotCommand {
    name: string;
    description?: string;
    options?: CommandOption[];
  }

  // ── Message content ────────────────────────────────────────────────────────

  export type BotContentType =
    | "text"
    | "app_card"
    | "embed"
    | "components"
    | "agent_tip"
    | "agent_info"
    | "ephemeral"
    | "onchain_tx"
    | "reply"
    | "attachment"
    | "link_unfurl";

  export type MessageVisibility =
    | "public"
    | "ephemeral"
    | "targeted"
    | "asymmetric";

  export type ExecutionStatus =
    | "pending_action"
    | "signed"
    | "confirmed"
    | "rejected"
    | "cancelled"
    | "expired";

  // ── Rich content structures ────────────────────────────────────────────────

  export interface AppCardAction {
    id: string;
    label: string;
    type?: "link" | "action" | "transaction";
    url?: string;
    payload?: Record<string, unknown>;
  }

  export interface AppCard {
    type: "app_card";
    title: string;
    description?: string;
    imageUrl?: string;
    fields?: Array<{ label: string; value: string }>;
    actions?: AppCardAction[];
  }

  export interface EmbedField {
    name: string;
    value: string;
    inline?: boolean;
  }

  export interface EmbedMessage {
    color?: string;
    author?: { name: string; iconUrl?: string; url?: string };
    title?: string;
    url?: string;
    description?: string;
    fields?: EmbedField[];
    thumbnail?: { url: string };
    image?: { url: string };
    footer?: { text: string; iconUrl?: string };
    timestamp?: string;
  }

  export type ButtonStyle =
    | "primary"
    | "secondary"
    | "success"
    | "danger"
    | "link";

  export interface ButtonComponent {
    type: "button";
    customId?: string;
    label: string;
    style?: ButtonStyle;
    url?: string;
    disabled?: boolean;
    emoji?: string;
  }

  export interface SelectOption {
    label: string;
    value: string;
    description?: string;
    emoji?: string;
    default?: boolean;
  }

  export interface SelectMenuComponent {
    type: "select_menu";
    customId: string;
    placeholder?: string;
    options: SelectOption[];
    minValues?: number;
    maxValues?: number;
    disabled?: boolean;
  }

  export interface ActionRow {
    type: "action_row";
    components: Array<ButtonComponent | SelectMenuComponent>;
  }

  export interface AttachmentMessage {
    url: string;
    filename: string;
    contentType?: string;
    size?: number;
    width?: number;
    height?: number;
  }

  export interface LinkUnfurlMessage {
    url: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
    favicon?: string;
  }

  // ── Webhook event payloads ─────────────────────────────────────────────────

  export interface ResolvedUser {
    principalId: string;
    username: string | null;
    displayName: string | null;
  }

  export interface ResolvedToken {
    symbol: string;
    address: string;
    chain: string;
  }

  export interface CommandPayload {
    commandName: string;
    options: Record<string, unknown>;
    resolved: {
      users: Record<string, ResolvedUser>;
      tokens: Record<string, ResolvedToken>;
    };
    rawArgs: string;
    groupId?: number;
    channelId?: number;
    conversationId?: string;
    senderId: string;
    messageId: string | number;
    placeholderMessageId: string | number;
    createdAt: string;
  }

  export interface MessagePayload {
    id: number;
    groupId: number;
    channelId: number;
    senderId: string;
    content: string;
    contentType: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }

  export interface DmMessagePayload {
    conversationId: string;
    messageId: string;
    senderPrincipalId: string;
    content: string;
    createdAt: string;
  }

  export interface SlashCommandEvent {
    event: "slash_command";
    payload: CommandPayload;
  }

  export interface MessageEvent {
    event: "message";
    payload: MessagePayload;
  }

  export interface DmMessageEvent {
    event: "dm_message";
    payload: DmMessagePayload;
  }

  export type WebhookEvent =
    | SlashCommandEvent
    | MessageEvent
    | DmMessageEvent;

  // ── Execution wrapper ──────────────────────────────────────────────────────

  export type ExecutionType = "onchain_tx";
  export type ExecutionSigningMode =
    | "butler_auto"
    | "user_sign"
    | "butler_or_user";

  export interface ExecutionPayload {
    type: "onchain_tx";
    chainId?: number;
    to?: string;
    data?: string;
    value?: string;
    tradeParams?: {
      tokenIn: string;
      chainIn: number;
      tokenOut: string;
      chainOut: number;
      slippageBps?: number;
      deadlineSecs?: number;
      recipient?: string;
    };
    amount?: string;
    currency?: string;
    from?: string;
    fromPrincipalId?: string;
    toPrincipalId?: string;
    description?: string;
    agentId?: string;
  }

  export interface MessageMetadata {
    execution?: ExecutionPayload;
    attachment?: AttachmentMessage;
    caption?: string;
    embed?: EmbedMessage;
    card?: AppCard;
    components?: ActionRow[];
    [key: string]: unknown;
  }

  // ── API I/O ────────────────────────────────────────────────────────────────

  export interface SendMessagePayload {
    groupId: number;
    channelId: number;
    content?: string;
    contentType?: BotContentType;
    card?: AppCard;
    embed?: EmbedMessage;
    components?: ActionRow[];
    metadata?: MessageMetadata;
    targets?: "all_butlers" | string[];
    signingMode?: ExecutionSigningMode;
  }

  export interface UpdateMessagePayload {
    content?: string;
    contentType?: BotContentType;
    card?: AppCard;
    embed?: EmbedMessage;
    components?: ActionRow[];
    metadata?: MessageMetadata;
  }

  export interface SendDmPayload {
    conversationId: string;
    content: string;
  }

  export interface GroupMember {
    id: number;
    groupId: number;
    principalId: string;
    agentWalletAddress?: string | null;
    roleIds: string[];
    joinedAt: string;
    displayName?: string;
    username?: string;
    avatar?: string | null;
    isOnline?: boolean;
  }

  export interface GroupMessage {
    id: number;
    groupId: number;
    channelId: number;
    content: string;
    contentType: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }

  export interface DmMessage {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    createdAt: string;
  }

  export interface SyncTextResponse {
    content: string;
    type?: 4;
  }

  export interface SyncCardResponse {
    card: AppCard;
    type?: 4;
  }

  export interface DeferredAck {
    type: 5;
  }

  export type WebhookResponse =
    | SyncTextResponse
    | SyncCardResponse
    | DeferredAck;

  export interface AgentUser {
    principalId: string;
    username: string | null;
    displayName: string | null;
    agentWalletAddress: string | null;
  }

  export type BevoPermission =
    | "wallet.read"
    | "wallet.send"
    | "wallet.sign"
    | "user.read"
    | "contacts.read"
    | "groups.read"
    | "chat.write"
    | "bots.manage";

  export type AppCategory =
    | "defi"
    | "nfts"
    | "games"
    | "social"
    | "utilities"
    | "other";

  // ── Context objects ────────────────────────────────────────────────────────

  export interface DeferredContext {
    update(content: string): Promise<void>;
    updateCard(card: AppCard): Promise<void>;
    updateWith(payload: UpdateMessagePayload): Promise<void>;
  }

  export interface CommandContext {
    readonly payload: CommandPayload;
    readonly client: BevoAgentClient;
    reply(content: string): void;
    replyCard(card: AppCard): void;
    defer(): Promise<DeferredContext>;
  }

  export interface MessageContext {
    readonly payload: MessagePayload;
    readonly client: BevoAgentClient;
    reply(content: string): Promise<void>;
    replyWith(
      payload: Omit<SendMessagePayload, "groupId" | "channelId">
    ): Promise<void>;
  }

  export interface DmContext {
    readonly payload: DmMessagePayload;
    readonly client: BevoAgentClient;
    reply(content: string): void;
    replyCard(card: AppCard): void;
    replyWith(
      payload: Pick<
        UpdateMessagePayload,
        "content" | "contentType" | "card" | "embed"
      >
    ): void;
  }

  export type CommandHandler = (ctx: CommandContext) => void | Promise<void>;
  export type MessageHandler = (ctx: MessageContext) => void | Promise<void>;
  export type DmHandler = (ctx: DmContext) => void | Promise<void>;

  // ── BevoAgentClient ────────────────────────────────────────────────────────

  export interface BevoAgentClientOptions {
    apiKey: string;
    apiBase: string;
  }

  export class BevoAgentClient {
    constructor(options: BevoAgentClientOptions);
    sendMessage(
      payload: SendMessagePayload
    ): Promise<{ message: GroupMessage }>;
    updateMessage(
      messageId: number,
      payload: UpdateMessagePayload
    ): Promise<{ message: GroupMessage }>;
    updateDmMessage(
      messageId: string,
      payload: UpdateMessagePayload
    ): Promise<{ message: DmMessage }>;
    sendDm(conversationId: string, content: string): Promise<{ message: DmMessage }>;
    registerCommands(
      commands: BotCommand[]
    ): Promise<{ ok: true; registered: number }>;
    getUser(principalId: string): Promise<AgentUser>;
    getGroupMembers(groupId: number): Promise<GroupMember[]>;
    getGroupState(groupId: number, key: string): Promise<unknown>;
    setGroupState(
      groupId: number,
      key: string,
      value: unknown
    ): Promise<{ success: true }>;
  }

  // ── BevoAgent ──────────────────────────────────────────────────────────────

  export interface BevoAgentOptions {
    apiKey: string;
    apiBase: string;
  }

  export class BevoAgent {
    readonly client: BevoAgentClient;
    constructor(options: BevoAgentOptions);
    command(
      name: string,
      handler: CommandHandler,
      meta?: Omit<BotCommand, "name">
    ): this;
    onMessage(handler: MessageHandler): this;
    onDm(handler: DmHandler): this;
    syncCommands(): Promise<void>;
    handleEvent(event: WebhookEvent): Promise<WebhookResponse | null>;
    express(): (req: unknown, res: unknown) => Promise<void>;
    fetch(): (request: Request) => Promise<Response>;
  }
}
