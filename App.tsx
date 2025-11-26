import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, SafeAreaView, KeyboardAvoidingView, Platform, RefreshControl, Alert } from 'react-native';
import { supabase } from './lib/supabase';

let myUserId = '';

type Stats = {
  total: number;
  month: number;
  week: number;
};

export default function App() {
  const [rawPosts, setRawPosts] = useState<any[]>([]); // DBから取った全データ
  const [posts, setPosts] = useState<any[]>([]);       // 画面に表示するデータ
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'self'>('public');
  const [stats, setStats] = useState<Stats>({ total: 0, month: 0, week: 0 });

  useEffect(() => {
    init();
  }, []);

  // visibility（モード）か rawPosts（データ）が変わったら表示を更新
  useEffect(() => {
    filterPosts();
  }, [visibility, rawPosts]);

  const init = async () => {
    // 1. まず「前にログインした情報」が残ってるか確認
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      // 残ってたらそれを使う（リロードしてもID変わらない！）
      console.log('おかえり！既存IDを使います:', session.user.id);
      myUserId = session.user.id;
    } else {
      // 残ってない時だけ、新しく作る（初回のみ）
      console.log('はじめまして！新規IDを作ります');
      const { data: { session: newSession }, error } = await supabase.auth.signInAnonymously();
      if (error) console.error('Login Error:', error);
      if (newSession) {
        myUserId = newSession.user.id;
      }
    }

    // 2. 投稿読み込み
    fetchPosts();
  };

  const fetchPosts = async () => {
    setLoading(true);
    
    // 全データを取得
    const { data, error } = await supabase
      .from('posts')
      .select('*, reactions(count)') 
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch Error:', error);
    } else {
      const allData = data || [];
      setRawPosts(allData); // まず生データを保存
      
      // 統計計算
      calculateStats(allData.filter(p => p.user_id === myUserId));
    }
    setLoading(false);
  };

  // 表示データのフィルタリングロジック
  const filterPosts = () => {
    if (visibility === 'self') {
      // 【自分だけモード】 自分の投稿のみ表示（公開・非公開問わず）
      const myPosts = rawPosts.filter(p => p.user_id === myUserId);
      setPosts(myPosts);
    } else {
      // 【みんなモード】 公開されている投稿 ＋ 自分の投稿
      const publicFeed = rawPosts.filter(p => 
        p.visibility === 'public' || p.user_id === myUserId
      );
      setPosts(publicFeed);
    }
  };

  const calculateStats = (myPosts: any[]) => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const stats = myPosts.reduce((acc, post) => {
      const date = new Date(post.created_at);
      acc.total += 1;
      if (date.getMonth() === thisMonth && date.getFullYear() === thisYear) {
        acc.month += 1;
      }
      if (date >= oneWeekAgo) {
        acc.week += 1;
      }
      return acc;
    }, { total: 0, month: 0, week: 0 });

    setStats(stats);
  };

  const sendPost = async () => {
    if (!text.trim()) return;
    if (!myUserId) return;
    
    // DB送信
    const { error } = await supabase
      .from('posts')
      .insert([{ 
        content: text, 
        user_id: myUserId,
        visibility: visibility // 現在のモード設定で保存
      }]);
    
    if (error) {
      Alert.alert('送信エラー', error.message);
    } else {
      setText('');
      fetchPosts(); // リスト更新
    }
  };

  const sendReaction = async (postId: string) => {
    if (!myUserId) return;

    // 表示上の数字を即時更新 (rawPostsも更新しないとフィルタ時に戻ってしまうので両方更新)
    const updateReaction = (list: any[]) => list.map(p => 
      p.id === postId 
        ? { ...p, reactions: [{ count: (p.reactions?.[0]?.count || 0) + 1 }] } 
        : p
    );

    setRawPosts(prev => updateReaction(prev)); 
    // setPostsはuseEffectでrawPostsの変更を検知して自動更新されるので不要だが、
    // 即時反映のラグを消すなら書いてもいい。今回はuseEffect任せでOK。

    const { error } = await supabase
      .from('reactions')
      .insert([{ post_id: postId, user_id: myUserId }]);

    if (error && error.code !== '23505') {
        console.error('Reaction Error:', error);
        fetchPosts(); 
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMyPost = item.user_id === myUserId;
    const reactionCount = item.reactions?.[0]?.count || 0;
    const isPrivate = item.visibility === 'self';

    return (
      <View style={[styles.card, !isMyPost && styles.otherCard]}>
        <View style={styles.cardHeader}>
          {isPrivate && isMyPost && <Text style={styles.privateBadge}>🔒 自分だけ</Text>}
        </View>
        
        <Text style={styles.cardText}>{item.content}</Text>
        
        <View style={styles.cardFooter}>
          <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
          <TouchableOpacity 
            style={styles.reactionButton} 
            onPress={() => sendReaction(item.id)}
            disabled={isMyPost}
          >
            <Text style={styles.reactionText}>💜 {reactionCount > 0 ? reactionCount : 'わかる'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inner Voice</Text>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>今週</Text>
            <Text style={styles.statValue}>{stats.week}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>今月</Text>
            <Text style={styles.statValue}>{stats.month}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>累計</Text>
            <Text style={styles.statValue}>{stats.total}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPosts} />}
        // データがない時の表示
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {visibility === 'self' ? 'まだ記録はありません' : '投稿を読み込んでいます...'}
            </Text>
          </View>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.inputWrapper}>
          {/* モード切り替えスイッチ */}
          <View style={styles.visibilitySelector}>
            <TouchableOpacity 
              style={[styles.radioOption, visibility === 'public' && styles.radioActive]}
              onPress={() => setVisibility('public')}
            >
              <Text style={[styles.radioText, visibility === 'public' && styles.radioTextActive]}>🌏 みんな</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.radioOption, visibility === 'self' && styles.radioActive]}
              onPress={() => setVisibility('self')}
            >
              <Text style={[styles.radioText, visibility === 'self' && styles.radioTextActive]}>🔒 自分だけ</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={visibility === 'self' ? "自分へのメモ..." : "誰かに聞いてほしい..."}
              value={text}
              onChangeText={setText}
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendPost}>
              <Text style={styles.sendButtonText}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { padding: 20, paddingTop: 50, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333', letterSpacing: 1, marginBottom: 15 },
  
  statsContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, width: '100%', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statLabel: { fontSize: 11, color: '#999', marginBottom: 2 },
  statValue: { fontSize: 16, fontWeight: 'bold', color: '#555' },
  statDivider: { width: 1, height: 20, backgroundColor: '#ddd' },

  listContent: { padding: 20, paddingBottom: 150 },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#aaa' },

  card: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 5, elevation: 1 },
  otherCard: { backgroundColor: '#f5f5f7' }, 
  cardHeader: { marginBottom: 5 },
  privateBadge: { fontSize: 10, color: '#666', backgroundColor: '#eee', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  cardText: { fontSize: 16, color: '#333', lineHeight: 26, marginBottom: 15 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 12, color: '#aaa' },
  reactionButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#eee' },
  reactionText: { fontSize: 13, color: '#e0245e', fontWeight: '600' },

  inputWrapper: { backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee', paddingBottom: 20 },
  visibilitySelector: { flexDirection: 'row', paddingHorizontal: 15, paddingTop: 10, paddingBottom: 5 },
  radioOption: { marginRight: 15, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#f0f2f5' },
  radioActive: { backgroundColor: '#333' },
  radioText: { fontSize: 12, color: '#666' },
  radioTextActive: { color: '#fff', fontWeight: 'bold' },

  inputContainer: { flexDirection: 'row', padding: 15, paddingTop: 5, alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#f0f2f5', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, fontSize: 16, maxHeight: 100 },
  sendButton: { marginLeft: 10, width: 44, height: 44, backgroundColor: '#333', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});