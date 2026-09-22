import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { service } from "@ember/service";
import coldAgeClass from "discourse/helpers/cold-age-class";
import concatClass from "discourse/helpers/concat-class";
import dIcon from "discourse/helpers/d-icon";
import formatDate from "discourse/helpers/format-date";
import { getURLWithCDN } from "discourse/lib/get-url";
import { loadBilibiliThumbnailForTopic } from "../lib/bilibili-thumbnail";

export default class TopicListThumbnail extends Component {
  @service topicThumbnails;

  @tracked externalThumbnailUrl = null;
  @tracked bilibiliLoadAttempted = false;

  responsiveRatios = [1, 1.5, 2];

  constructor() {
    super(...arguments);
    this.loadExternalThumbnail();
  }

  async loadExternalThumbnail() {
    if (this.hasLocalThumbnail || this.bilibiliLoadAttempted) {
      return;
    }

    this.bilibiliLoadAttempted = true;
    const url = await loadBilibiliThumbnailForTopic(this.topic);
    if (url) {
      this.externalThumbnailUrl = url;
    }
  }

  // Make sure to update about.json thumbnail sizes if you change these variables
  get displayWidth() {
    return this.topicThumbnails.displayList
      ? settings.list_thumbnail_size
      : 400;
  }

  get topic() {
    return this.args.topic;
  }

  get hasLocalThumbnail() {
    return (this.topic.thumbnails?.length || 0) > 0;
  }

  get hasThumbnail() {
    return this.hasLocalThumbnail || !!this.externalThumbnailUrl;
  }

  get srcSet() {
    const srcSetArray = [];

    this.responsiveRatios.forEach((ratio) => {
      const target = ratio * this.displayWidth;
      const match = this.topic.thumbnails.find(
        (t) => t.url && t.max_width === target
      );
      if (match) {
        srcSetArray.push(`${match.url} ${ratio}x`);
      }
    });

    if (srcSetArray.length === 0) {
      srcSetArray.push(`${this.original.url} 1x`);
    }

    return srcSetArray.join(",");
  }

  get original() {
    return this.topic.thumbnails[0];
  }

  get width() {
    return this.original?.width || 400;
  }

  get isLandscape() {
    if (this.externalThumbnailUrl) {
      return true;
    }
    return this.original.width >= this.original.height;
  }

  get height() {
    return this.original?.height || 225;
  }

  get fallbackSrc() {
    if (this.externalThumbnailUrl) {
      return this.externalThumbnailUrl;
    }

    const largeEnough = this.topic.thumbnails.filter((t) => {
      if (!t.url) {
        return false;
      }
      return t.max_width > this.displayWidth * this.responsiveRatios.at(-1);
    });

    const largest = largeEnough.at(-1);
    if (largest) {
      return largest.url;
    }

    return this.original.url;
  }

  get url() {
    return this.topic.get("linked_post_number")
      ? this.topic.urlForPostNumber(this.topic.get("linked_post_number"))
      : this.topic.get("lastUnreadUrl");
  }

  get gridAvatarUser() {
    const topic = this.topic;
    return (
      topic?.lastPosterUser ||
      topic?.lastPoster?.user ||
      topic?.featuredUsers?.find((p) => p?.user)?.user ||
      topic?.posters?.find((p) => p?.user)?.user ||
      topic?.creator
    );
  }

  get gridAvatarUrl() {
    const template = this.gridAvatarUser?.avatar_template;
    if (!template) {
      return null;
    }
    return getURLWithCDN(template.replace(/\{size\}/g, "48"));
  }

  get gridAvatarUsername() {
    return this.gridAvatarUser?.username;
  }

  get gridAvatarPath() {
    const user = this.gridAvatarUser;
    if (!user) {
      return null;
    }
    return user.path || `/u/${user.username}`;
  }

  get thumbnailClass() {
    const classes = ["topic-list-thumbnail"];
    if (this.hasThumbnail) {
      classes.push("has-thumbnail");
      if (this.isLandscape) {
        classes.push("landscape");
      }
      if (this.externalThumbnailUrl) {
        classes.push("external-thumbnail");
      }
    } else {
      classes.push("no-thumbnail");
    }
    return classes.join(" ");
  }

  <template>
    <div class={{this.thumbnailClass}}>
      <a href={{this.url}} role="img" aria-label={{this.topic.title}}>
        {{#if this.hasLocalThumbnail}}
          <img
            class="background-thumbnail"
            src={{this.fallbackSrc}}
            srcset={{this.srcSet}}
            width={{this.width}}
            height={{this.height}}
            loading="lazy"
            alt=""
          />
          <img
            class="main-thumbnail"
            src={{this.fallbackSrc}}
            srcset={{this.srcSet}}
            width={{this.width}}
            height={{this.height}}
            loading="lazy"
            alt=""
          />
        {{else if this.externalThumbnailUrl}}
          <img
            class="background-thumbnail"
            src={{this.externalThumbnailUrl}}
            loading="lazy"
            alt=""
          />
          <img
            class="main-thumbnail"
            src={{this.externalThumbnailUrl}}
            loading="lazy"
            alt=""
          />
        {{else}}
          <div class="thumbnail-placeholder">
            {{dIcon settings.placeholder_icon}}
          </div>
        {{/if}}
      </a>
    </div>

    {{#if this.topicThumbnails.displayGrid}}
      {{#if this.gridAvatarUrl}}
        <a
          href={{this.gridAvatarPath}}
          data-user-card={{this.gridAvatarUsername}}
          class="topic-thumbnails-grid__avatar"
          title={{this.gridAvatarUsername}}
        >
          <img
            src={{this.gridAvatarUrl}}
            class="avatar"
            width="24"
            height="24"
            alt=""
            loading="lazy"
          />
        </a>
      {{/if}}
    {{/if}}

    {{#if this.topicThumbnails.showLikes}}
      <div class="topic-thumbnail-likes">
        {{dIcon "heart"}}
        <span class="number">
          {{this.topic.like_count}}
        </span>
      </div>
    {{/if}}

    {{#if this.topicThumbnails.displayBlogStyle}}
      <div class="topic-thumbnail-blog-data">
        <div class="topic-thumbnail-blog-data-views">
          {{dIcon "eye"}}
          <span class="number">
            {{this.topic.views}}
          </span>
        </div>
        <div class="topic-thumbnail-blog-data-likes">
          {{dIcon "heart"}}
          <span class="number">
            {{this.topic.like_count}}
          </span>
        </div>
        <div class="topic-thumbnail-blog-data-comments">
          {{dIcon "comment"}}
          <span class="number">
            {{this.topic.replyCount}}
          </span>
        </div>
        <div
          class={{concatClass
            "topic-thumbnail-blog-data-activity"
            "activity"
            (coldAgeClass
              this.topic.createdAt startDate=this.topic.bumpedAt class=""
            )
          }}
          title={{this.topic.bumpedAtTitle}}
        >
          <a class="post-activity" href={{this.topic.lastPostUrl}}>
            {{~formatDate this.topic.bumpedAt format="tiny" noTitle="true"~}}
          </a>
        </div>
      </div>
    {{/if}}
  </template>
}
