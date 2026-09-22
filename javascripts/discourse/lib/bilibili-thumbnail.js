import { ajax } from "discourse/lib/ajax";

const bilibiliThumbnailCache = new Map();
const LOCAL_THUMBNAIL_PATH_REGEXP = /\/(?:uploads|optimized)\//;
const BILIBILI_VIDEO_ID_REGEXP =
  /(?:bilibili\.com\/video\/|\/video\/)(BV[a-zA-Z0-9]+|av\d+)/i;
const BILIBILI_VIDEO_URL_REGEXP =
  /https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV[a-zA-Z0-9]+|av\d+)[^"'\s<]*/i;
const BILIBILI_SHORT_URL_REGEXP =
  /https?:\/\/(?:www\.)?b23\.tv\/[A-Za-z0-9]+[^"'\s<]*/i;

function parseOverrideMap() {
  const map = new Map();
  const raw = (settings.bilibili_thumbnail_urls || "")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);

  for (let index = 0; index < raw.length - 1; index += 2) {
    map.set(raw[index].toLowerCase(), raw[index + 1]);
  }

  return map;
}

const bilibiliThumbnailOverrides = parseOverrideMap();

function normalizeUrl(url) {
  return url?.replaceAll("&amp;", "&");
}

function normalizeThumbnailUrl(url) {
  const normalizedUrl = normalizeUrl(url);

  if (!normalizedUrl) {
    return null;
  }

  if (normalizedUrl.startsWith("//")) {
    return `https:${normalizedUrl}`;
  }

  if (normalizedUrl.startsWith(window.location.origin)) {
    return normalizedUrl.slice(window.location.origin.length);
  }

  return normalizedUrl.replace(/^http:\/\//, "https://");
}

function isLocalThumbnailUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(normalizeUrl(url), window.location.origin);

    return (
      parsedUrl.origin === window.location.origin &&
      LOCAL_THUMBNAIL_PATH_REGEXP.test(parsedUrl.pathname)
    );
  } catch {
    return false;
  }
}

export function extractBilibiliVideo(sources) {
  const text = sources.filter(Boolean).join(" ");
  const urlMatch = text.match(BILIBILI_VIDEO_URL_REGEXP);

  if (urlMatch) {
    return {
      id: urlMatch[1],
      url: normalizeUrl(urlMatch[0]),
    };
  }

  const shortMatch = text.match(BILIBILI_SHORT_URL_REGEXP);
  if (shortMatch) {
    return {
      id: null,
      url: normalizeUrl(shortMatch[0]),
    };
  }

  const idMatch = text.match(BILIBILI_VIDEO_ID_REGEXP);
  const id = idMatch?.[1];

  if (!id) {
    return null;
  }

  return {
    id,
    url: `https://www.bilibili.com/video/${id}`,
  };
}

function extractImageFromHtml(html, localOnly = false) {
  if (!html) {
    return null;
  }

  const template = document.createElement("template");
  const candidates = [];

  template.innerHTML = html;

  template.content.querySelectorAll(".onebox img, img").forEach((image) => {
    const src = normalizeThumbnailUrl(image.getAttribute("src"));
    if (src) {
      candidates.push({ url: src, width: null });
    }
  });

  const usable = localOnly
    ? candidates.filter((c) => isLocalThumbnailUrl(c.url))
    : candidates;

  return usable[0]?.url || null;
}

async function fetchBilibiliApiCover(videoId) {
  const query = videoId.toLowerCase().startsWith("av")
    ? `aid=${videoId.slice(2)}`
    : `bvid=${videoId}`;

  const response = await fetch(
    `https://api.bilibili.com/x/web-interface/view?${query}`,
    { credentials: "omit" }
  );
  const data = await response.json();
  return normalizeThumbnailUrl(data?.data?.pic);
}

async function fetchOneboxThumbnail(videoUrl, topic) {
  const params = new URLSearchParams({
    url: videoUrl,
    topic_id: topic.id,
    category_id: topic.category_id,
  });
  const html = await fetch(`/onebox?${params.toString()}`).then((r) =>
    r.text()
  );

  return (
    extractImageFromHtml(html, true) ||
    (settings.bilibili_remote_thumbnail_fallback
      ? extractImageFromHtml(html)
      : null)
  );
}

async function resolveVideoFromTopicJson(topic) {
  try {
    const slug = topic.slug;
    const topicPath = slug ? `/t/${slug}/${topic.id}.json` : `/t/${topic.id}.json`;
    const payload = await ajax(topicPath);
    const firstPost = payload?.post_stream?.posts?.[0];

    const cookedImage = extractImageFromHtml(firstPost?.cooked, true);
    if (cookedImage) {
      return { thumbnailUrl: cookedImage };
    }

    const video = extractBilibiliVideo([
      payload?.featured_link,
      firstPost?.cooked,
      firstPost?.link_counts?.map((link) => link.url).join(" "),
    ]);

    return { video };
  } catch {
    return null;
  }
}

/**
 * Returns a cover image URL for Bilibili topics without local Discourse thumbnails.
 */
export async function loadBilibiliThumbnailForTopic(topic) {
  if (!topic?.id || topic.thumbnails?.length > 0) {
    return null;
  }

  if (!settings.bilibili_remote_thumbnail_fallback) {
    const overrideOnly = extractBilibiliVideo([
      topic.featured_link,
      topic.excerpt,
      topic.last_post_excerpt,
    ]);
    if (overrideOnly?.id) {
      return bilibiliThumbnailOverrides.get(overrideOnly.id.toLowerCase()) || null;
    }
    return null;
  }

  const cached = bilibiliThumbnailCache.get(topic.id);
  if (cached !== undefined) {
    return cached;
  }

  let video = extractBilibiliVideo([
    topic.featured_link,
    topic.excerpt,
    topic.last_post_excerpt,
  ]);

  if (!video?.id) {
    const fromTopic = await resolveVideoFromTopicJson(topic);
    if (fromTopic?.thumbnailUrl) {
      bilibiliThumbnailCache.set(topic.id, fromTopic.thumbnailUrl);
      return fromTopic.thumbnailUrl;
    }
    if (fromTopic?.video) {
      video = fromTopic.video;
    }
  }

  if (!video?.url && !video?.id) {
    bilibiliThumbnailCache.set(topic.id, null);
    return null;
  }

  if (video.id) {
    const override = bilibiliThumbnailOverrides.get(video.id.toLowerCase());
    if (override) {
      const normalized = normalizeThumbnailUrl(override);
      bilibiliThumbnailCache.set(topic.id, normalized);
      return normalized;
    }
  }

  try {
    const oneboxImage = await fetchOneboxThumbnail(video.url, topic);
    if (oneboxImage) {
      bilibiliThumbnailCache.set(topic.id, oneboxImage);
      return oneboxImage;
    }
  } catch {
    // fall through to API
  }

  if (video.id) {
    try {
      const apiCover = await fetchBilibiliApiCover(video.id);
      if (apiCover) {
        bilibiliThumbnailCache.set(topic.id, apiCover);
        return apiCover;
      }
    } catch {
      // ignore
    }
  }

  bilibiliThumbnailCache.set(topic.id, null);
  return null;
}
