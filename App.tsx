import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, 
  SafeAreaView, KeyboardAvoidingView, Platform, RefreshControl, 
  LayoutAnimation, UIManager 
} from 'react-native';
import { supabase } from './lib/supabase';
import * as Haptics from 'expo-haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

let myUserId = '';

type Stats = { total: number; month: number; week: number; };

export default function App() {
  const [rawPosts, setRawPosts] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'self'>('public');
  const [stats, setStats] = useState<Stats>({ total: 0, month: 0, week: 0 });

  useEffect(() => { init(); }, []);

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    filterPosts();
  }, [visibility, rawPosts]);

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      myUserId = session.user.id;
    } else {
      const { data: { session: newSession } } = await supabase.auth.signInAnonymously();
      if (newSession) myUserId = newSession.user.id;
    }
    fetchPosts();
  };

  const fetchPosts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('posts')
      .select('*, reactions(count)') 
      .order('created_at', { ascending: false });

    if (data) {
      setRawPosts(data);
      calculateStats(data.filter(p => p.user_id === myUserId));
    }
    setLoading(false);
  };

  const filterPosts = () => {
    if (visibility === 'self') {
      setPosts(rawPosts.filter(p => p.user_id === myUserId));
    } else {
      setPosts(rawPosts.filter(p => p.visibility === 'public' || p.user_id === myUserId));
    }
  };

  const calculateStats = (myPosts: any[]) => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const stats = myPosts.reduce((acc, post) => {
      const date = new Date(post.created_at);
      acc.total += 1;
      if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) acc.month += 1;
      if (date >= oneWeekAgo) acc.week += 1;
      return acc;
    }, { total: 0, month: 0, week: 0 });
    setStats(stats);
  };

  const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);

    if (diffInMinutes < 1) return 'たった今';
    if (diffInMinutes < 60) return `${diffInMinutes}分前`;
    
    return date.toLocaleDateString('ja-JP', { 
      month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' 
    });
  };

  const sendPost = async () => {
    if (!text.trim() || !myUserId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const { error } = await supabase
      .from('posts')
      .insert([{ content: text, user_id: myUserId, visibility: visibility }]);
    
    if (!error) {
      setText('');
      fetchPosts();
    }
  };

  const sendReaction = async (postId: string) => {
    if (!myUserId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const updateReaction = (list: any[]) => list.map(p => 
      p.id === postId ? { ...p, reactions: [{ count: (p.reactions?.[0]?.count || 0) + 1 }] } : p
    );
    setRawPosts(prev => updateReaction(prev)); 

    await supabase.from('reactions').insert([{ post_id: postId, user_id: myUserId }]);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMyPost = item.user_id === myUserId;
    const reactionCount = item.reactions?.[0]?.count || 0;
    
    return (
      <View style={[styles.card, !isMyPost && styles.otherCard]}>
        {isMyPost && <View style={styles.myPostIndicator} />}
        
        <Text style={[styles.cardText, !isMyPost && styles.otherCardText]}>{item.content}</Text>
        
        <View style={styles.cardFooter}>
          <Text style={styles.date}>
            {item.visibility === 'self' ? '🔒 ' : ''}
            {formatRelativeTime(item.created_at)}
          </Text>
          <TouchableOpacity 
            style={[styles.reactionButton, reactionCount > 0 && styles.reactionButtonActive]} 
            onPress={() => sendReaction(item.id)}
            disabled={isMyPost}
          >
            <Text style={[styles.reactionIcon, isMyPost && {opacity: 0.3}]}>
              {reactionCount > 0 ? '❤️' : '🤍'}
            </Text>
            {reactionCount > 0 && <Text style={styles.reactionCount}>{reactionCount}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 画面全体をKeyboardAvoidingViewで包むのが正解 */}
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20} // Android用に少し調整
      >
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Inner Voice</Text>
          <Text style={styles.headerSubtitle}>
            {visibility === 'public' ? 'The world is listening.' : 'Just for you.'}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statPill}><Text style={styles.statLabel}>Week</Text><Text style={styles.statNum}>{stats.week}</Text></View>
            <View style={styles.statPill}><Text style={styles.statLabel}>Total</Text><Text style={styles.statNum}>{stats.total}</Text></View>
          </View>
        </View>

        <View style={styles.segmentContainer}>
          <View style={styles.segmentWrapper}>
            <TouchableOpacity 
              style={[styles.segmentBtn, visibility === 'public' && styles.segmentBtnActive]} 
              onPress={() => { Haptics.selectionAsync(); setVisibility('public'); }}
            >
              <Text style={[styles.segmentText, visibility === 'public' && styles.segmentTextActive]}>Public</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentBtn, visibility === 'self' && styles.segmentBtnActive]} 
              onPress={() => { Haptics.selectionAsync(); setVisibility('self'); }}
            >
              <Text style={[styles.segmentText, visibility === 'self' && styles.segmentTextActive]}>Private</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.contentContainer}>
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPosts} tintColor="#999" />}
            showsVerticalScrollIndicator={false}
          />

          {/* 入力欄を絶対配置(absolute)のまま、AvoidingViewの中に入れる */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Type your thoughts..."
              placeholderTextColor="#999"
              value={text}
              onChangeText={setText}
              multiline
            />
            <TouchableOpacity 
              style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]} 
              onPress={sendPost}
              disabled={!text.trim()}
            >
              <Text style={styles.sendIcon}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  contentContainer: { flex: 1, position: 'relative' }, // ここをrelativeにしておく

  headerContainer: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 10, backgroundColor: '#F9FAFB' },
  headerTitle: { fontSize: 34, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 15, color: '#8E8E93', marginTop: 4, marginBottom: 16, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E5E5EA', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  statLabel: { fontSize: 12, color: '#666', marginRight: 6, fontWeight: '600' },
  statNum: { fontSize: 14, fontWeight: '800', color: '#333' },
  segmentContainer: { paddingHorizontal: 24, marginBottom: 10 },
  segmentWrapper: { flexDirection: 'row', backgroundColor: '#E5E5EA', borderRadius: 12, padding: 3 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  segmentBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: {width:0, height:2} },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#8E8E93' },
  segmentTextActive: { color: '#000' },
  listContent: { paddingHorizontal: 24, paddingBottom: 120, paddingTop: 10 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 24, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: {width:0, height:8}, elevation: 3 },
  otherCard: { backgroundColor: '#fff', opacity: 0.8 },
  myPostIndicator: { position: 'absolute', top: 20, left: 20, width: 4, height: 4, borderRadius: 2, backgroundColor: '#007AFF' },
  cardText: { fontSize: 17, color: '#1C1C1E', lineHeight: 26, fontWeight: '400', letterSpacing: 0.3 },
  otherCardText: { color: '#3A3A3C' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  date: { fontSize: 12, color: '#C7C7CC', fontWeight: '500' },
  reactionButton: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 12 },
  reactionButtonActive: { backgroundColor: '#FFF0F5' },
  reactionIcon: { fontSize: 18 },
  reactionCount: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: '#FF2D55' },
  
  // inputWrapperは「contentContainerの底」に張り付くようにする
  inputWrapper: { 
    position: 'absolute', 
    bottom: 20, // 少し浮かせる
    left: 20, 
    right: 20, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(255,255,255,0.95)', 
    borderRadius: 32, 
    padding: 6, 
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: {width:0, height:10},
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)'
  },
  input: { flex: 1, paddingHorizontal: 20, paddingVertical: 12, fontSize: 16, maxHeight: 100, color: '#333' },
  sendButton: { width: 44, height: 44, backgroundColor: '#000', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#E5E5EA' },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: -2 },
});