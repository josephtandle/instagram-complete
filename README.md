# Instagram Complete MCP Server

Stop manually posting to Instagram. Schedule content, analyze performance, and manage your entire Instagram presence from your AI assistant.

Connect Claude (or any MCP-compatible AI) directly to your Instagram account and automate everything from publishing Reels to tracking hashtag performance.

## Tools

| Tool | Category | Description |
|------|----------|-------------|
| `publish_photo` | Publishing | Post a photo to your Instagram feed with caption and user tags |
| `publish_video` | Publishing | Publish a video to your feed |
| `publish_carousel` | Publishing | Upload a 2-10 item carousel album |
| `publish_story` | Publishing | Post a photo or video to Instagram Stories |
| `publish_reel` | Publishing | Publish a short-form Reel (max 90 seconds) |
| `get_profile` | Profile | Get your account info, bio, and follower count |
| `update_bio` | Profile | Update your Instagram bio (max 150 chars) |
| `get_followers` | Profile | List your followers with pagination |
| `get_following` | Profile | List accounts you follow |
| `get_media_insights` | Analytics | Get impressions, reach, engagement for a specific post |
| `get_profile_insights` | Analytics | Account-level analytics over a date range |
| `get_audience_demographics` | Analytics | Age, gender, country, city breakdowns of your audience |
| `search_hashtags` | Discovery | Find hashtag IDs by name |
| `get_hashtag_media` | Discovery | Browse top or recent posts for a hashtag |
| `get_trending_hashtags` | Discovery | Compare reach across multiple hashtags at once |
| `list_media` | Media | List all your posts with pagination |
| `get_media` | Media | Get full details for a specific post |
| `delete_media` | Media | Delete a post permanently |
| `get_media_comments` | Media | Fetch comments on a post |
| `schedule_post` | Scheduling | Schedule a photo or video to publish at a future time |

## Quick Start

### 1. Get Your Instagram Credentials

You'll need a **Business or Creator Instagram account** connected to a Facebook Page.

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create an app and add the Instagram Graph API product
3. Generate a long-lived access token with these permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_insights`
   - `instagram_manage_comments`
4. Find your Instagram User ID via the API or a tool like [Graph API Explorer](https://developers.facebook.com/tools/explorer/)

### 2. Configure Environment Variables

```bash
INSTAGRAM_ACCESS_TOKEN=your_access_token_here
INSTAGRAM_USER_ID=your_instagram_user_id_here
```

### 3. Run the Server

```bash
npm install
npm start
```

The server starts on port 8080 (or `PORT` env var).

Health check: `GET http://localhost:8080/health`

MCP endpoint: `POST http://localhost:8080/mcp`

## Example Usage

```
"Publish this photo to my Instagram feed with the caption 'Morning in Bali #bali #travel'"
"Get my last 20 posts and show me which ones had the most engagement"
"Schedule a post for next Monday at 9am Bali time"
"What are my top hashtags performing this month?"
```

## API Reference

This server wraps the official Instagram Graph API:
- Base URL: `https://graph.facebook.com/v18.0`
- Docs: [developers.facebook.com/docs/instagram-api](https://developers.facebook.com/docs/instagram-api)

## Built with MCPize

Deploy and manage MCP servers at [mcpize.com](https://mcpize.com).

---

Built by [Mastermindshq.business](https://mastermindshq.business) — AI systems for serious operators.
