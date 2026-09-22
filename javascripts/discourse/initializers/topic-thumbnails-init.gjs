import { readOnly } from "@ember/object/computed";
import { service } from "@ember/service";
import { apiInitializer } from "discourse/lib/api";
import DUserLink from "discourse/ui-kit/d-user-link";
import dAvatar from "discourse/ui-kit/helpers/d-avatar";
import TopicListThumbnail from "../components/topic-list-thumbnail";

export default apiInitializer((api) => {
  const ttService = api.container.lookup("service:topic-thumbnails");

  api.registerValueTransformer("topic-list-class", ({ value }) => {
    if (ttService.displayMinimalGrid) {
      value.push("topic-thumbnails-minimal");
    } else if (ttService.displayGrid) {
      value.push("topic-thumbnails-grid");
    } else if (ttService.displayList) {
      value.push("topic-thumbnails-list");
    } else if (ttService.displayMasonry) {
      value.push("topic-thumbnails-masonry");
    } else if (ttService.displayBlogStyle) {
      value.push("topic-thumbnails-blog-style-grid");
    }
    return value;
  });

  api.registerValueTransformer("topic-list-columns", ({ value: columns }) => {
    if (ttService.enabledForRoute && !ttService.displayList) {
      columns.add(
        "thumbnail",
        { item: TopicListThumbnail },
        { before: "topic" }
      );
    }
    return columns;
  });

  api.renderInOutlet(
    "topic-list-before-link",
    <template>
      {{#if ttService.displayList}}
        <TopicListThumbnail @topic={{@outletArgs.topic}} />
      {{/if}}
    </template>
  );

  // Grid cards: render avatar inside main-link (reliable) instead of posters column
  api.renderInOutlet(
    "topic-list-main-link-bottom",
    <template>
      {{#if ttService.displayGrid}}
        {{#if @outletArgs.topic.lastPosterUser}}
          <div class="topic-thumbnails-grid__avatar">
            <DUserLink
              @username={{@outletArgs.topic.lastPosterUser.username}}
              @href={{@outletArgs.topic.lastPosterUser.path}}
            >
              {{dAvatar @outletArgs.topic.lastPosterUser imageSize="small"}}
            </DUserLink>
          </div>
        {{/if}}
      {{/if}}
    </template>
  );

  api.registerValueTransformer("topic-list-item-mobile-layout", ({ value }) => {
    if (ttService.enabledForRoute && !ttService.displayList) {
      // Force the desktop layout
      return false;
    }
    return value;
  });

  api.registerValueTransformer(
    "topic-list-item-class",
    ({ value, context: { index } }) => {
      if (ttService.displayMasonry) {
        value.push(`masonry-${index}`);
      }
      return value;
    }
  );

  const siteSettings = api.container.lookup("service:site-settings");
  if (settings.docs_thumbnail_mode !== "none" && siteSettings.docs_enabled) {
    api.modifyClass("component:docs-topic-list", {
      pluginId: "topic-thumbnails",
      topicThumbnailsService: service("topic-thumbnails"),
      classNameBindings: [
        "isMinimalGrid:topic-thumbnails-minimal",
        "isThumbnailGrid:topic-thumbnails-grid",
        "isThumbnailList:topic-thumbnails-list",
        "isMasonryList:topic-thumbnails-masonry",
        "isBlogStyleGrid:topic-thumbnails-blog-style-grid",
      ],
      isMinimalGrid: readOnly("topicThumbnailsService.displayMinimalGrid"),
      isThumbnailGrid: readOnly("topicThumbnailsService.displayGrid"),
      isThumbnailList: readOnly("topicThumbnailsService.displayList"),
      isMasonryList: readOnly("topicThumbnailsService.displayMasonry"),
      isBlogStyleGrid: readOnly("topicThumbnailsService.displayBlogStyle"),
    });
  }
});
