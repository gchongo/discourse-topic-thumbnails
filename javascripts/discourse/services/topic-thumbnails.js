import { tracked } from "@glimmer/tracking";
import { getOwner } from "@ember/owner";
import { computed } from "@ember/object";
import { dependentKeyCompat } from "@ember/object/compat";
import Service, { service } from "@ember/service";
import Site from "discourse/models/site";

const minimalGridCategories = settings.minimal_grid_categories
  .split("|")
  .map((id) => parseInt(id, 10));

const listCategories = settings.list_categories
  .split("|")
  .map((id) => parseInt(id, 10));

const gridCategories = settings.grid_categories
  .split("|")
  .map((id) => parseInt(id, 10));

const masonryCategories = settings.masonry_categories
  .split("|")
  .map((id) => parseInt(id, 10));

const blogStyleCategories = settings.blog_style_categories
  .split("|")
  .map((id) => parseInt(id, 10));

const minimalGridTags = settings.minimal_grid_tags.split("|");
const listTags = settings.list_tags.split("|");
const gridTags = settings.grid_tags.split("|");
const masonryTags = settings.masonry_tags.split("|");
const blogStyleTags = settings.blog_style_tags.split("|");

export default class TopicThumbnailService extends Service {
  @service router;
  @service discovery;

  @tracked masonryContainerWidth;

  @dependentKeyCompat
  get isTopicListRoute() {
    return this.discovery.onDiscoveryRoute;
  }

  @computed("router.currentRouteName")
  get isTopicRoute() {
    return this.router?.currentRouteName?.match(/^topic\./);
  }

  @computed("router.currentRouteName")
  get isDocsRoute() {
    return this.router?.currentRouteName?.match(/^docs\./);
  }

  // Topic pages are not discovery routes, so discovery.category is empty.
  // Read the current topic so suggested-topics can reuse the same
  // category / tag whitelist as the category list (e.g. Tutorial → grid).
  @computed("isTopicRoute", "router.currentURL")
  get currentTopic() {
    if (!this.isTopicRoute) {
      return null;
    }
    return getOwner(this).lookup("controller:topic")?.model;
  }

  @computed("discovery.category.id", "currentTopic.category_id", "currentTopic.category.id")
  get viewingCategoryId() {
    return (
      this.discovery.category?.id ??
      this.currentTopic?.category_id ??
      this.currentTopic?.category?.id
    );
  }

  @computed("discovery.tag.name", "currentTopic.tags.[]")
  get viewingTagName() {
    if (this.discovery.tag?.name) {
      return this.discovery.tag.name;
    }
    const tags = this.currentTopic?.tags;
    return Array.isArray(tags) && tags.length ? tags[0] : null;
  }

  @computed(
    "viewingCategoryId",
    "viewingTagName",
    "router.currentRoute.metadata.customThumbnailMode",
    "isTopicListRoute",
    "isTopicRoute",
    "isDocsRoute"
  )
  get displayMode() {
    if (this.router?.currentRoute?.metadata?.customThumbnailMode) {
      return this.router?.currentRoute?.metadata?.customThumbnailMode;
    }
    if (minimalGridCategories.includes(this.viewingCategoryId)) {
      return "minimal-grid";
    } else if (blogStyleCategories.includes(this.viewingCategoryId)) {
      return "blog-style";
    } else if (masonryCategories.includes(this.viewingCategoryId)) {
      return "masonry";
    } else if (gridCategories.includes(this.viewingCategoryId)) {
      return "grid";
    } else if (listCategories.includes(this.viewingCategoryId)) {
      return "list";
    } else if (masonryTags.includes(this.viewingTagName)) {
      return "masonry";
    } else if (minimalGridTags.includes(this.viewingTagName)) {
      return "minimal-grid";
    } else if (blogStyleTags.includes(this.viewingTagName)) {
      return "blog-style";
    } else if (gridTags.includes(this.viewingTagName)) {
      return "grid";
    } else if (listTags.includes(this.viewingTagName)) {
      return "list";
    } else if (this.isTopicRoute) {
      // Suggested list follows the current topic's category/tag whitelist only.
      // Do not apply suggested_topics_mode globally (would cover every category).
      return "none";
    } else if (this.isTopicListRoute || settings.enable_outside_topic_lists) {
      return settings.default_thumbnail_mode;
    } else if (this.isDocsRoute) {
      return settings.docs_thumbnail_mode;
    } else {
      return "none";
    }
  }

  @computed("displayMode")
  get enabledForRoute() {
    return this.displayMode !== "none";
  }

  @computed()
  get enabledForDevice() {
    return Site.current().mobileView ? settings.mobile_thumbnails : true;
  }

  @computed("enabledForRoute", "enabledForDevice")
  get shouldDisplay() {
    return this.enabledForRoute && this.enabledForDevice;
  }

  @computed("shouldDisplay", "displayMode")
  get displayMinimalGrid() {
    return this.shouldDisplay && this.displayMode === "minimal-grid";
  }

  @computed("shouldDisplay", "displayMode")
  get displayList() {
    return this.shouldDisplay && this.displayMode === "list";
  }

  @computed("shouldDisplay", "displayMode")
  get displayGrid() {
    return this.shouldDisplay && this.displayMode === "grid";
  }

  @computed("shouldDisplay", "displayMode")
  get displayMasonry() {
    return this.shouldDisplay && this.displayMode === "masonry";
  }

  @computed("shouldDisplay", "displayMode")
  get displayBlogStyle() {
    return this.shouldDisplay && this.displayMode === "blog-style";
  }

  @computed("displayMinimalGrid", "displayBlogStyle")
  get showLikes() {
    return this.displayMinimalGrid;
  }
}
