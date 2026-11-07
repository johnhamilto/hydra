import {
  useContext,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  ColorValue,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import useCommentScrolling from "./useCommentScrolling";
import usePostDetail from "./usePostDetail";
import { StackPageProps } from "../../app/stack";
import PostDetailsComponent from "../../components/RedditDataRepresentations/Post/PostDetailsComponent";
import Comments from "../../components/RedditDataRepresentations/Post/PostParts/Comments";
import {
  ScrollerContext,
  ScrollerProvider,
} from "../../contexts/ScrollerContext";
import ScrollToNextButtonProvider from "../../contexts/ScrollToNextButtonProvider";
import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";
import { TabScrollContext } from "../../contexts/TabScrollContext";
import {
  TabBarScrollView,
  TabBarSpacer,
} from "../../contexts/TabBarInsetsContext";
import AccessFailureComponent from "../../components/UI/AccessFailureComponent";
import RedditURL from "../../utils/RedditURL";
import { usePageRef } from "../../contexts/PageStateContext";

type PostDetailsProps =
  | StackPageProps<"PostDetailsPage">
  | {
      splitViewURL: string;
      setSplitViewURL: (url: string | null) => void;
    };

function PostDetails(props: PostDetailsProps) {
  const url = "route" in props ? props.route.params.url : props.splitViewURL;
  const isSplitView = "splitViewURL" in props && !!props.splitViewURL;

  const { theme } = useContext(ThemeContext);
  const { scrollDisabled } = useContext(ScrollerContext);
  const { handleScrollForTabBar } = useContext(TabScrollContext);
  const scrollPosition = usePageRef<{ x: number; y: number } | undefined>(
    `post-scroll:${url}`,
    undefined,
  );
  const restorationRef = useRef({
    url,
    offset: scrollPosition.current,
    restored: !scrollPosition.current,
  });
  if (restorationRef.current.url !== url) {
    restorationRef.current = {
      url,
      offset: scrollPosition.current,
      restored: !scrollPosition.current,
    };
  }
  const scrollRestoration = restorationRef.current;

  const {
    postDetail,
    setPostDetail,
    loadError,
    refreshing,
    loadPostDetails,
    changeComment,
    deleteComment,
    loadMoreComments,
  } = usePostDetail(url, isSplitView);

  // Lets the post render immediately while a large comment tree mounts.
  const deferredPostDetail = useDeferredValue(postDetail);

  const {
    scrollView,
    topOfScroll,
    commentsHandle,
    scrollChange,
    collapseThread,
  } = useCommentScrolling(postDetail, changeComment);

  /**
   * The tintColor prop on the RefreshControl component is broken in React
   * Native 0.81.5. This is a workaround to fix the bug. Same fix is used in
   * the RedditDataScroller component.
   * https://github.com/facebook/react-native/issues/53987
   */
  const [refreshControlColor, setRefreshControlColor] = useState<ColorValue>();
  useEffect(() => {
    setTimeout(() => {
      setRefreshControlColor(theme.text);
    }, 500);
  }, []);

  return (
    <View style={styles.postDetailsOuterContainer}>
      {postDetail ? (
        <TabBarScrollView
          key={url}
          ref={scrollView}
          contentOffset={scrollRestoration.offset}
          onContentSizeChange={() => {
            if (
              scrollRestoration.restored ||
              !scrollView.current ||
              !scrollRestoration.offset
            )
              return;
            scrollView.current.scrollTo({
              ...scrollRestoration.offset,
              animated: false,
            });
            scrollRestoration.restored = true;
          }}
          refreshControl={
            <RefreshControl
              tintColor={refreshControlColor}
              refreshing={refreshing}
              onRefresh={() => loadPostDetails()}
            />
          }
          scrollEnabled={!scrollDisabled}
          onScroll={(e) => {
            if (scrollRestoration.restored) {
              scrollPosition.current = e.nativeEvent.contentOffset;
            }
            handleScrollForTabBar(e);
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{
            // Room for the scroll-to-next button; TabBarSpacer clears the tab bar
            paddingBottom: 60,
          }}
        >
          <View ref={topOfScroll} />
          <PostDetailsComponent
            key={postDetail.id}
            postDetail={postDetail}
            loadPostDetails={loadPostDetails}
            setPostDetail={setPostDetail}
          />
          {deferredPostDetail && deferredPostDetail.comments.length > 0 ? (
            <Comments
              key={`${deferredPostDetail.id}-comments`}
              ref={commentsHandle}
              loadMoreComments={loadMoreComments}
              postDetail={deferredPostDetail}
              scrollChange={scrollChange}
              changeComment={changeComment}
              deleteComment={deleteComment}
              collapseThread={collapseThread}
              interactionDisabledStatus={postDetail.interactionDisabledStatus}
            />
          ) : postDetail !== deferredPostDetail ? (
            <View key="loading-comments" style={styles.commentsPlaceholder}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <View key="no-comments" style={styles.commentsPlaceholder}>
              <Text
                style={[
                  styles.noCommentsText,
                  {
                    color: theme.text,
                  },
                ]}
              >
                No comments
              </Text>
            </View>
          )}
          <TabBarSpacer />
        </TabBarScrollView>
      ) : loadError ? (
        <AccessFailureComponent
          accessFailure={loadError}
          contentName={new RedditURL(url).getSubreddit()}
        />
      ) : (
        <ActivityIndicator size="small" />
      )}
    </View>
  );
}

export default function PostDetailsPage(props: PostDetailsProps) {
  return (
    <ScrollToNextButtonProvider>
      <ScrollerProvider>
        <PostDetails {...props} />
      </ScrollerProvider>
    </ScrollToNextButtonProvider>
  );
}

const styles = StyleSheet.create({
  postDetailsOuterContainer: {
    flex: 1,
    justifyContent: "center",
  },
  commentsPlaceholder: {
    marginVertical: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  noCommentsText: {
    fontSize: 15,
  },
});
