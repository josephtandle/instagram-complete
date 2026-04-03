import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
const PORT = process.env.PORT || 8080;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID;
const GRAPH_API = "https://graph.facebook.com/v18.0";
// ── API Helpers ────────────────────────────────────────────────────────────────
async function graphRequest(path, method = "GET", body = null, params = {}) {
    const url = new URL(`${GRAPH_API}${path}`);
    url.searchParams.set("access_token", INSTAGRAM_ACCESS_TOKEN);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null)
            url.searchParams.set(k, String(v));
    }
    const opts = {
        method,
        headers: { "Content-Type": "application/json" },
    };
    if (body)
        opts.body = JSON.stringify(body);
    const res = await fetch(url.toString(), opts);
    const data = (await res.json());
    if (data.error)
        throw new Error(`Instagram API error: ${data.error.message} (code ${data.error.code})`);
    return data;
}
function requireAuth() {
    if (!INSTAGRAM_ACCESS_TOKEN)
        throw new Error("INSTAGRAM_ACCESS_TOKEN env var is required");
    if (!INSTAGRAM_USER_ID)
        throw new Error("INSTAGRAM_USER_ID env var is required");
}
function jsonText(obj) {
    return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}
// ── MCP Server ─────────────────────────────────────────────────────────────────
const server = new McpServer({
    name: "instagram-complete",
    version: "1.0.0",
});
// ── 1. Content Publishing ──────────────────────────────────────────────────────
server.tool("publish_photo", "Publish a photo to your Instagram feed. Provide a public URL to the image and an optional caption with hashtags.", {
    image_url: z.string().url().describe("Public URL of the image to post (must be accessible by Instagram)"),
    caption: z.string().max(2200).optional().describe("Post caption (max 2200 chars). Include hashtags here."),
    location_id: z.string().optional().describe("Optional Facebook location page ID to tag"),
}, async ({ image_url, caption, location_id }) => {
    requireAuth();
    const containerBody = { image_url, caption: caption || "", is_carousel_item: false };
    if (location_id)
        containerBody.location_id = location_id;
    const container = await graphRequest(`/${INSTAGRAM_USER_ID}/media`, "POST", containerBody);
    const result = await graphRequest(`/${INSTAGRAM_USER_ID}/media_publish`, "POST", { creation_id: container.id });
    return jsonText({ success: true, media_id: result.id, message: "Photo published to Instagram feed" });
});
server.tool("publish_video", "Publish a video to your Instagram feed. Provide a public URL to the video file (MP4, max 15 min).", {
    video_url: z.string().url().describe("Public URL of the video to post"),
    caption: z.string().max(2200).optional().describe("Post caption with optional hashtags"),
    location_id: z.string().optional().describe("Optional Facebook location page ID"),
}, async ({ video_url, caption, location_id }) => {
    requireAuth();
    const containerBody = { media_type: "VIDEO", video_url, caption: caption || "" };
    if (location_id)
        containerBody.location_id = location_id;
    const container = await graphRequest(`/${INSTAGRAM_USER_ID}/media`, "POST", containerBody);
    let status = "IN_PROGRESS";
    let attempts = 0;
    while (status === "IN_PROGRESS" && attempts < 20) {
        await new Promise(r => setTimeout(r, 5000));
        const check = await graphRequest(`/${container.id}`, "GET", null, { fields: "status_code" });
        status = check.status_code || "IN_PROGRESS";
        attempts++;
    }
    if (status !== "FINISHED")
        throw new Error(`Video processing failed with status: ${status}`);
    const result = await graphRequest(`/${INSTAGRAM_USER_ID}/media_publish`, "POST", { creation_id: container.id });
    return jsonText({ success: true, media_id: result.id, message: "Video published to Instagram feed" });
});
server.tool("publish_carousel", "Publish a carousel post (album) with 2-10 images or videos. Great for before/after comparisons or product collections.", {
    media_items: z.array(z.object({
        url: z.string().url().describe("Public URL of the media item"),
        type: z.enum(["IMAGE", "VIDEO"]).describe("Media type"),
    })).min(2).max(10).describe("Array of 2-10 media items"),
    caption: z.string().max(2200).optional().describe("Caption for the carousel post"),
    location_id: z.string().optional().describe("Optional Facebook location page ID"),
}, async ({ media_items, caption, location_id }) => {
    requireAuth();
    const childIds = [];
    for (const item of media_items) {
        const body = { is_carousel_item: true };
        if (item.type === "IMAGE")
            body.image_url = item.url;
        else {
            body.media_type = "VIDEO";
            body.video_url = item.url;
        }
        const child = await graphRequest(`/${INSTAGRAM_USER_ID}/media`, "POST", body);
        childIds.push(child.id);
    }
    const carouselBody = {
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption: caption || "",
    };
    if (location_id)
        carouselBody.location_id = location_id;
    const container = await graphRequest(`/${INSTAGRAM_USER_ID}/media`, "POST", carouselBody);
    const result = await graphRequest(`/${INSTAGRAM_USER_ID}/media_publish`, "POST", { creation_id: container.id });
    return jsonText({ success: true, media_id: result.id, items_count: childIds.length, message: "Carousel published to Instagram feed" });
});
server.tool("publish_story", "Publish a photo or video to your Instagram Stories. Stories disappear after 24 hours.", {
    media_url: z.string().url().describe("Public URL of the photo or video for the story"),
    media_type: z.enum(["IMAGE", "VIDEO"]).describe("Type of media: IMAGE or VIDEO"),
}, async ({ media_url, media_type }) => {
    requireAuth();
    const body = { media_type: `${media_type}_STORIES` };
    if (media_type === "IMAGE")
        body.image_url = media_url;
    else
        body.video_url = media_url;
    const container = await graphRequest(`/${INSTAGRAM_USER_ID}/media`, "POST", body);
    const result = await graphRequest(`/${INSTAGRAM_USER_ID}/media_publish`, "POST", { creation_id: container.id });
    return jsonText({ success: true, media_id: result.id, message: "Story published successfully" });
});
server.tool("publish_reel", "Publish a short-form video as an Instagram Reel (max 90 seconds). Reels are the highest-reach content format on Instagram.", {
    video_url: z.string().url().describe("Public URL of the video (MP4, max 90 seconds for Reels)"),
    caption: z.string().max(2200).optional().describe("Reel caption with hashtags. Example: 'POV: You just discovered the best workflow hack #productivity'"),
    cover_url: z.string().url().optional().describe("Public URL for the cover image thumbnail"),
    share_to_feed: z.boolean().optional().default(true).describe("Whether to also share the Reel to the main feed (default: true)"),
}, async ({ video_url, caption, cover_url, share_to_feed }) => {
    requireAuth();
    const body = {
        media_type: "REELS",
        video_url,
        caption: caption || "",
        share_to_feed: share_to_feed !== false,
    };
    if (cover_url)
        body.cover_url = cover_url;
    const container = await graphRequest(`/${INSTAGRAM_USER_ID}/media`, "POST", body);
    let status = "IN_PROGRESS";
    let attempts = 0;
    while (status === "IN_PROGRESS" && attempts < 24) {
        await new Promise(r => setTimeout(r, 5000));
        const check = await graphRequest(`/${container.id}`, "GET", null, { fields: "status_code" });
        status = check.status_code || "IN_PROGRESS";
        attempts++;
    }
    if (status !== "FINISHED")
        throw new Error(`Reel processing failed with status: ${status}`);
    const result = await graphRequest(`/${INSTAGRAM_USER_ID}/media_publish`, "POST", { creation_id: container.id });
    return jsonText({ success: true, media_id: result.id, share_to_feed, message: "Reel published successfully" });
});
// ── 2. Profile Management ──────────────────────────────────────────────────────
server.tool("get_profile", "Get your Instagram profile information including bio, follower count, media count, and account details.", {
    fields: z.array(z.string()).optional().default(["id", "name", "username", "biography", "followers_count", "follows_count", "media_count", "profile_picture_url", "website"]).describe("Profile fields to retrieve"),
}, async ({ fields }) => {
    requireAuth();
    const data = await graphRequest(`/${INSTAGRAM_USER_ID}`, "GET", null, { fields: fields.join(",") });
    return jsonText(data);
});
server.tool("update_bio", "Update your Instagram profile biography. Requires Business or Creator account. Max 150 characters.", {
    biography: z.string().max(150).describe("New bio text (max 150 characters)"),
}, async ({ biography }) => {
    requireAuth();
    const result = await graphRequest(`/${INSTAGRAM_USER_ID}`, "POST", { biography });
    return jsonText({ success: true, updated: true, biography, result });
});
server.tool("get_followers", "Get a list of your Instagram followers with pagination. Useful for audience analysis and tracking follower growth.", {
    limit: z.number().min(1).max(100).optional().default(25).describe("Number of followers to return (1-100, default 25)"),
    after: z.string().optional().describe("Pagination cursor from previous response"),
}, async ({ limit, after }) => {
    requireAuth();
    const params = { fields: "id,username,name,profile_picture_url", limit };
    if (after)
        params.after = after;
    const data = await graphRequest(`/${INSTAGRAM_USER_ID}/followers`, "GET", null, params);
    return jsonText({ followers: data.data || [], count: data.data?.length || 0, pagination: data.paging || null });
});
server.tool("get_following", "Get a list of accounts your Instagram account is following with pagination.", {
    limit: z.number().min(1).max(100).optional().default(25).describe("Number of accounts to return"),
    after: z.string().optional().describe("Pagination cursor from previous response"),
}, async ({ limit, after }) => {
    requireAuth();
    const params = { fields: "id,username,name,profile_picture_url", limit };
    if (after)
        params.after = after;
    const data = await graphRequest(`/${INSTAGRAM_USER_ID}/follows`, "GET", null, params);
    return jsonText({ following: data.data || [], count: data.data?.length || 0, pagination: data.paging || null });
});
// ── 3. Analytics ───────────────────────────────────────────────────────────────
server.tool("get_media_insights", "Get performance analytics for a specific Instagram post, story, or reel. Returns impressions, reach, likes, comments, shares, saves.", {
    media_id: z.string().describe("Instagram media ID. Get this from list_media. Example: '17854360229135492'"),
    metrics: z.array(z.enum([
        "impressions", "reach", "engagement", "saved", "video_views",
        "likes", "comments", "shares", "follows", "profile_visits", "replies",
        "taps_forward", "taps_back", "exits", "total_interactions"
    ])).optional().default(["impressions", "reach", "engagement", "saved", "likes", "comments", "shares"]).describe("Metrics to retrieve"),
}, async ({ media_id, metrics }) => {
    requireAuth();
    const data = await graphRequest(`/${media_id}/insights`, "GET", null, { metric: metrics.join(",") });
    const insights = {};
    for (const item of (data.data || [])) {
        const values = item.values;
        insights[item.name] = values ? values[0]?.value : item.value;
    }
    return jsonText({ media_id, insights, raw: data.data });
});
server.tool("get_profile_insights", "Get account-level analytics including impressions, reach, follower count changes, and profile visits over a date range.", {
    metrics: z.array(z.enum([
        "impressions", "reach", "follower_count", "profile_views",
        "website_clicks", "email_contacts", "get_directions_clicks",
        "phone_call_clicks", "text_message_clicks"
    ])).optional().default(["impressions", "reach", "follower_count", "profile_views"]).describe("Account-level metrics to retrieve"),
    period: z.enum(["day", "week", "days_28", "month", "lifetime"]).optional().default("days_28").describe("Time period for metrics"),
    since: z.string().optional().describe("Start date in YYYY-MM-DD format. Example: '2024-01-01'"),
    until: z.string().optional().describe("End date in YYYY-MM-DD format. Example: '2024-01-31'"),
}, async ({ metrics, period, since, until }) => {
    requireAuth();
    const params = { metric: metrics.join(","), period };
    if (since)
        params.since = Math.floor(new Date(since).getTime() / 1000);
    if (until)
        params.until = Math.floor(new Date(until).getTime() / 1000);
    const data = await graphRequest(`/${INSTAGRAM_USER_ID}/insights`, "GET", null, params);
    const insights = {};
    for (const item of (data.data || [])) {
        insights[item.name] = item.values || item.value;
    }
    return jsonText({ period, insights });
});
server.tool("get_audience_demographics", "Get demographic breakdown of your Instagram audience: age ranges, gender split, top countries/cities. Requires Business or Creator account.", {
    breakdown_type: z.enum(["age", "gender", "country", "city"]).describe("Type of demographic breakdown"),
}, async ({ breakdown_type }) => {
    requireAuth();
    const metricMap = {
        age: "audience_gender_age",
        gender: "audience_gender_age",
        country: "audience_country",
        city: "audience_city",
    };
    const data = await graphRequest(`/${INSTAGRAM_USER_ID}/insights`, "GET", null, {
        metric: metricMap[breakdown_type],
        period: "lifetime",
    });
    return jsonText({ breakdown_type, demographics: data.data || [] });
});
// ── 4. Content Discovery ───────────────────────────────────────────────────────
server.tool("search_hashtags", "Search for Instagram hashtags and get their IDs. Use this before get_hashtag_media. Example: search 'balilife' to get the hashtag ID.", {
    hashtag: z.string().describe("Hashtag to search (without the # symbol). Example: 'balilife'"),
}, async ({ hashtag }) => {
    requireAuth();
    const data = await graphRequest(`/ig_hashtag_search`, "GET", null, {
        user_id: INSTAGRAM_USER_ID,
        q: hashtag.replace(/^#/, ""),
    });
    return jsonText({ hashtag: hashtag.replace(/^#/, ""), results: data.data || [] });
});
server.tool("get_hashtag_media", "Get top or recent media posts for a specific hashtag. First use search_hashtags to get the hashtag ID.", {
    hashtag_id: z.string().describe("Hashtag ID from search_hashtags. Example: '17843825132370203'"),
    media_type: z.enum(["top_media", "recent_media"]).optional().default("top_media").describe("Whether to get top or recent posts"),
    fields: z.array(z.string()).optional().default(["id", "media_type", "media_url", "timestamp", "like_count", "comments_count"]).describe("Fields to return for each post"),
    limit: z.number().min(1).max(50).optional().default(10).describe("Number of posts to return"),
}, async ({ hashtag_id, media_type, fields, limit }) => {
    requireAuth();
    const data = await graphRequest(`/${hashtag_id}/${media_type}`, "GET", null, {
        user_id: INSTAGRAM_USER_ID,
        fields: fields.join(","),
        limit,
    });
    return jsonText({
        hashtag_id,
        media_type,
        posts: data.data || [],
        count: data.data?.length || 0,
        pagination: data.paging || null,
    });
});
server.tool("get_trending_hashtags", "Compare multiple hashtags at once to find the best ones for your content strategy. Returns media count and info for each hashtag.", {
    hashtags: z.array(z.string()).min(1).max(10).describe("List of hashtags to analyze (without # symbol). Example: ['fitness','workout','gym']"),
}, async ({ hashtags }) => {
    requireAuth();
    const results = [];
    for (const tag of hashtags) {
        try {
            const searchResult = await graphRequest(`/ig_hashtag_search`, "GET", null, {
                user_id: INSTAGRAM_USER_ID,
                q: tag.replace(/^#/, ""),
            });
            const items = searchResult.data;
            if (items && items.length > 0) {
                const tagId = items[0].id;
                const info = await graphRequest(`/${tagId}`, "GET", null, { fields: "id,name,media_count" });
                results.push({ hashtag: tag, id: tagId, ...info });
            }
            else {
                results.push({ hashtag: tag, error: "Not found" });
            }
        }
        catch (err) {
            results.push({ hashtag: tag, error: err.message });
        }
    }
    return jsonText({ hashtags: results });
});
// ── 5. Media Management ────────────────────────────────────────────────────────
server.tool("list_media", "List your Instagram media posts with pagination. Returns photos, videos, carousels, and reels from your feed.", {
    limit: z.number().min(1).max(100).optional().default(20).describe("Number of posts to return (1-100, default 20)"),
    after: z.string().optional().describe("Pagination cursor from previous response"),
    fields: z.array(z.string()).optional().default(["id", "media_type", "thumbnail_url", "media_url", "caption", "timestamp", "like_count", "comments_count", "permalink"]).describe("Fields to return for each post"),
}, async ({ limit, after, fields }) => {
    requireAuth();
    const params = { fields: fields.join(","), limit };
    if (after)
        params.after = after;
    const data = await graphRequest(`/${INSTAGRAM_USER_ID}/media`, "GET", null, params);
    return jsonText({ media: data.data || [], count: data.data?.length || 0, pagination: data.paging || null });
});
server.tool("get_media", "Get detailed information about a specific Instagram post including caption, timestamp, engagement stats, and media URL.", {
    media_id: z.string().describe("Instagram media ID. Example: '17854360229135492'"),
    fields: z.array(z.string()).optional().default(["id", "media_type", "media_url", "thumbnail_url", "caption", "timestamp", "like_count", "comments_count", "permalink", "is_comment_enabled"]).describe("Fields to retrieve"),
}, async ({ media_id, fields }) => {
    requireAuth();
    const data = await graphRequest(`/${media_id}`, "GET", null, { fields: fields.join(",") });
    return jsonText(data);
});
server.tool("delete_media", "Delete an Instagram post permanently. This action cannot be undone.", {
    media_id: z.string().describe("Instagram media ID to delete. Get IDs from list_media. Example: '17854360229135492'"),
}, async ({ media_id }) => {
    requireAuth();
    const result = await graphRequest(`/${media_id}`, "DELETE");
    return jsonText({ success: true, deleted_media_id: media_id, result });
});
server.tool("get_media_comments", "Get comments on a specific Instagram post. Useful for community management and tracking engagement quality.", {
    media_id: z.string().describe("Instagram media ID. Example: '17854360229135492'"),
    limit: z.number().min(1).max(100).optional().default(20).describe("Number of comments to return"),
    after: z.string().optional().describe("Pagination cursor for next page of comments"),
    fields: z.array(z.string()).optional().default(["id", "text", "timestamp", "username", "like_count"]).describe("Comment fields to return"),
}, async ({ media_id, limit, after, fields }) => {
    requireAuth();
    const params = { fields: fields.join(","), limit };
    if (after)
        params.after = after;
    const data = await graphRequest(`/${media_id}/comments`, "GET", null, params);
    return jsonText({ media_id, comments: data.data || [], count: data.data?.length || 0, pagination: data.paging || null });
});
// ── 6. Scheduling ──────────────────────────────────────────────────────────────
server.tool("schedule_post", "Schedule an Instagram photo or video post for a future time. The post will be automatically published at the specified timestamp. Must be 10 min to 75 days in the future.", {
    image_url: z.string().url().optional().describe("Public URL of the image to post (use this OR video_url)"),
    video_url: z.string().url().optional().describe("Public URL of the video to post (use this OR image_url)"),
    caption: z.string().max(2200).optional().describe("Post caption with hashtags"),
    scheduled_publish_time: z.string().describe("ISO 8601 datetime for when to publish. Must be 10 min to 75 days in the future. Example: '2024-12-25T10:00:00Z'"),
    media_type: z.enum(["IMAGE", "VIDEO", "REELS"]).optional().default("IMAGE").describe("Type of content to schedule"),
}, async ({ image_url, video_url, caption, scheduled_publish_time, media_type }) => {
    requireAuth();
    if (!image_url && !video_url)
        throw new Error("Either image_url or video_url is required");
    const publishTime = Math.floor(new Date(scheduled_publish_time).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    const tenMinutes = 10 * 60;
    const seventyFiveDays = 75 * 24 * 60 * 60;
    if (publishTime < now + tenMinutes)
        throw new Error("Scheduled time must be at least 10 minutes in the future");
    if (publishTime > now + seventyFiveDays)
        throw new Error("Scheduled time cannot be more than 75 days in the future");
    const body = {
        caption: caption || "",
        published: false,
        scheduled_publish_time: publishTime,
    };
    if (media_type === "VIDEO") {
        body.media_type = "VIDEO";
        body.video_url = video_url;
    }
    else if (media_type === "REELS") {
        body.media_type = "REELS";
        body.video_url = video_url;
    }
    else
        body.image_url = image_url;
    const container = await graphRequest(`/${INSTAGRAM_USER_ID}/media`, "POST", body);
    return jsonText({
        success: true,
        container_id: container.id,
        scheduled_for: scheduled_publish_time,
        message: "Post scheduled successfully. It will be published automatically at the specified time.",
    });
});
// ── Express App ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "instagram-complete", version: "1.0.0" });
});
app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => `ig-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
});
app.listen(PORT, () => {
    console.log(`Instagram Complete MCP server listening on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
