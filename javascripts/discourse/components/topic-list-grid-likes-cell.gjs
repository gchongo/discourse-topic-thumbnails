import dNumber from "discourse/ui-kit/helpers/d-number";

// Same classes as core likes cell so any theme can style it.
// No icons here — themes add icons via CSS (e.g. ::before on .num.likes).
const TopicListGridLikesCell = <template>
  <td class="num likes topic-list-data">
    {{dNumber @topic.like_count}}
  </td>
</template>;

export default TopicListGridLikesCell;
