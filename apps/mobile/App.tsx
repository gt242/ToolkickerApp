// apps/mobile/App.tsx
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useMemo, useState, useContext } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  View,
  Text,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  Image,
  FlatList,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* -------------------------------------------------
   Small UI helpers
--------------------------------------------------*/
function ScreenContainer({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="always">
        <Text style={styles.h1}>{title}</Text>
        {children ?? <Text style={styles.body}>Placeholder screen</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
function BigButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.btn} onPress={onPress}>
      <Text style={styles.btnTxt}>{label}</Text>
    </Pressable>
  );
}

/* -------------------------------------------------
   Basic data + storage
--------------------------------------------------*/
type Tool = {
  id: string;
  name: string;
  pricePerDay: number;
  category: string;
  description?: string;
  photoUri?: string;
  archived?: boolean;
};

const CATEGORIES = [
  { value: 'toolboxes_kits', label: 'Toolboxes & Kits' },
  { value: 'power_tools', label: 'Power Tools' },
  { value: 'benches_tables', label: 'Benches & Tables' },
  { value: 'concrete_masonry', label: 'Concrete & Masonry' },
  { value: 'drywall_plaster', label: 'Drywall & Plaster' },
  { value: 'carpentry_framing', label: 'Carpentry & Framing' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'ladders_scaffolding', label: 'Ladders & Scaffolding' },
  { value: 'material_handling', label: 'Material Handling' },
  { value: 'other', label: 'Other' },
];
function catLabel(v: string) {
  return CATEGORIES.find(c => c.value === v)?.label ?? 'Other';
}
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const STORAGE_KEY  = 'toolkicker.tools.v1';
const FAVS_KEY     = 'toolkicker.favs.v1';
const CART_KEY     = 'toolkicker.cart.v1';
const BOOKINGS_KEY = 'toolkicker.bookings.v1';

/* -------------------------------------------------
   Tools Context (tools + favorites)
--------------------------------------------------*/
type ToolsContextType = {
  tools: Tool[];
  favs: string[];                          // favorite tool IDs
  addTool: (t: Omit<Tool, 'id' | 'archived'>) => void;
  updateTool: (id: string, patch: Partial<Tool>) => void;
  archiveTool: (id: string, archived: boolean) => void;
  deleteTool: (id: string) => void;
  toggleFav: (id: string) => void;
  isFav: (id: string) => boolean;
};
const ToolsContext = React.createContext<ToolsContextType | null>(null);
function useTools() {
  const ctx = useContext(ToolsContext);
  if (!ctx) throw new Error('useTools must be used inside ToolsProvider');
  return ctx;
}
function ToolsProvider({ children }: { children: React.ReactNode }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [favs, setFavs] = useState<string[]>([]);

  // load once
  useEffect(() => {
    (async () => {
      try {
        const [rawTools, rawFavs] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(FAVS_KEY),
        ]);
        if (rawTools) setTools(JSON.parse(rawTools));
        if (rawFavs) setFavs(JSON.parse(rawFavs));
      } catch {}
    })();
  }, []);

  // save on change
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tools)).catch(() => {});
  }, [tools]);
  useEffect(() => {
    AsyncStorage.setItem(FAVS_KEY, JSON.stringify(favs)).catch(() => {});
  }, [favs]);

  const value = useMemo<ToolsContextType>(
    () => ({
      tools,
      favs,
      addTool: (t) =>
        setTools(prev => [...prev, { ...t, id: makeId(), archived: false }]),
      updateTool: (id, patch) =>
        setTools(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x))),
      archiveTool: (id, archived) =>
        setTools(prev => prev.map(x => (x.id === id ? { ...x, archived } : x))),
      deleteTool: (id) => {
        setTools(prev => prev.filter(x => x.id !== id));
        setFavs(prev => prev.filter(fid => fid !== id));
      },
      toggleFav: (id) =>
        setFavs(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])),
      isFav: (id) => favs.includes(id),
    }),
    [tools, favs]
  );

  return <ToolsContext.Provider value={value}>{children}</ToolsContext.Provider>;
}

/* -------------------------------------------------
   Cart Context (items + totals)
--------------------------------------------------*/
type CartItem = { toolId: string; days: number };
type CartContextType = {
  items: CartItem[];
  add: (toolId: string, days?: number) => void;
  updateDays: (toolId: string, days: number) => void;
  remove: (toolId: string) => void;
  clear: () => void;
  total: (tools: Tool[]) => number;
};
const CartContext = React.createContext<CartContextType | null>(null);
function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CART_KEY);
        if (raw) setItems(JSON.parse(raw));
      } catch {}
    })();
  }, []);
  useEffect(() => {
    AsyncStorage.setItem(CART_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  const value = useMemo<CartContextType>(
    () => ({
      items,
      add: (toolId, days = 1) => {
        setItems(prev => {
          const existing = prev.find(x => x.toolId === toolId);
          if (existing) return prev.map(x => x.toolId === toolId ? { ...x, days: x.days + days } : x);
          return [...prev, { toolId, days }];
        });
      },
      updateDays: (toolId, days) =>
        setItems(prev => prev.map(x => x.toolId === toolId ? { ...x, days: Math.max(1, days) } : x)),
      remove: (toolId) => setItems(prev => prev.filter(x => x.toolId !== toolId)),
      clear: () => setItems([]),
      total: (tools) =>
        items.reduce((sum, ci) => {
          const t = tools.find(tt => tt.id === ci.toolId);
          return t ? sum + t.pricePerDay * ci.days : sum;
        }, 0),
    }),
    [items]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/* -------------------------------------------------
   Bookings Context (saved orders)
--------------------------------------------------*/
type BookingItem = { toolId: string; name: string; pricePerDay: number; days: number };
type Booking = { id: string; createdAt: number; items: BookingItem[]; total: number; status: 'requested' | 'confirmed' | 'completed' };

type BookingsContextType = {
  bookings: Booking[];
  addBooking: (cartItems: CartItem[], tools: Tool[]) => string; // returns booking id
  clearAll: () => void;
};
const BookingsContext = React.createContext<BookingsContextType | null>(null);
function useBookings() {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error('useBookings must be used inside BookingsProvider');
  return ctx;
}
function BookingsProvider({ children }: { children: React.ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BOOKINGS_KEY);
        if (raw) setBookings(JSON.parse(raw));
      } catch {}
    })();
  }, []);
  useEffect(() => {
    AsyncStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings)).catch(() => {});
  }, [bookings]);

  const value = useMemo<BookingsContextType>(
    () => ({
      bookings,
      addBooking: (cartItems, tools) => {
        const items: BookingItem[] = cartItems
          .map(ci => {
            const t = tools.find(tt => tt.id === ci.toolId);
            return t ? { toolId: t.id, name: t.name, pricePerDay: t.pricePerDay, days: ci.days } : null;
          })
          .filter(Boolean) as BookingItem[];
        const total = items.reduce((s, i) => s + i.pricePerDay * i.days, 0);
        const booking: Booking = {
          id: makeId(),
          createdAt: Date.now(),
          items,
          total,
          status: 'requested',
        };
        setBookings(prev => [booking, ...prev]);
        return booking.id;
      },
      clearAll: () => setBookings([]),
    }),
    [bookings]
  );

  return <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>;
}

/* -------------------------------------------------
   Category Picker (used by Add & Browse)
--------------------------------------------------*/
function CategoryPicker({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const label = value ? catLabel(value) : 'All Categories';
  return (
    <>
      <Pressable style={styles.selectBox} onPress={() => setOpen(true)}>
        <Text style={{ fontWeight: '700', marginBottom: 4 }}>Category</Text>
        <Text>{label}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.h1}>Choose a category</Text>
            <FlatList
              data={[{ value: '', label: 'All Categories' }, ...CATEGORIES]}
              keyExtractor={(i) => i.value || 'all'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => { onPick(item.value); setOpen(false); }}
                >
                  <Text style={{ fontSize: 16 }}>{item.label}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
            />
            <Pressable onPress={() => setOpen(false)} style={[styles.btn,{marginTop:12}]}>
              <Text style={styles.btnTxt}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* -------------------------------------------------
   Auth stack
--------------------------------------------------*/
type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  Onboarding: undefined;
  AppTabs: undefined;
};
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function WelcomeScreen({ navigation }: any) {
  return (
    <ScreenContainer title="Toolkicker">
      <BigButton label="Login" onPress={() => navigation.navigate('Login')} />
      <BigButton label="Register" onPress={() => navigation.navigate('Register')} />
      <View style={{ height: 8 }} />
      <BigButton label="Continue with Google" onPress={() => Alert.alert('TODO', 'Google sign-in later')} />
      <BigButton label="Continue with Facebook" onPress={() => Alert.alert('TODO', 'Facebook sign-in later')} />
      <Text style={styles.note}>By continuing you agree to Terms & Privacy.</Text>
    </ScreenContainer>
  );
}
function LoginScreen({ navigation }: any) {
  return (
    <ScreenContainer title="Login">
      <BigButton label="Login (dummy)" onPress={() => navigation.replace('AppTabs')} />
      <BigButton label="Forgot password?" onPress={() => Alert.alert('TODO', 'Reset flow later')} />
      <View style={{ height: 8 }} />
      <BigButton label="Continue with Google" onPress={() => Alert.alert('TODO', 'Google sign-in later')} />
      <BigButton label="Continue with Facebook" onPress={() => Alert.alert('TODO', 'Facebook sign-in later')} />
    </ScreenContainer>
  );
}
function RegisterScreen({ navigation }: any) {
  return (
    <ScreenContainer title="Create Account">
      <BigButton label="Create Account (dummy)" onPress={() => navigation.replace('Onboarding')} />
      <View style={{ height: 8 }} />
      <BigButton label="Continue with Google" onPress={() => Alert.alert('TODO', 'Google sign-in later')} />
      <BigButton label="Continue with Facebook" onPress={() => Alert.alert('TODO', 'Facebook sign-in later')} />
    </ScreenContainer>
  );
}
function OnboardingScreen({ navigation }: any) {
  return (
    <ScreenContainer title="Quick Setup">
      <Text style={styles.body}>Add photo, set city/zip, allow notifications (later).</Text>
      <BigButton label="Finish" onPress={() => navigation.replace('AppTabs')} />
    </ScreenContainer>
  );
}

/* -------------------------------------------------
   Tabs + stacks
--------------------------------------------------*/
type RootTabParamList = {
  HomeTab: undefined;
  BrowseTab: undefined;
  AddManageTab: undefined;
  BookingsTab: undefined;
  ProfileTab: undefined;
};
const Tabs = createBottomTabNavigator<RootTabParamList>();

/* ---------- Home ---------- */
type HomeStackParams = { Dashboard: undefined; Messages: undefined; Chat: { who?: string } | undefined; };
const HomeStack = createNativeStackNavigator<HomeStackParams>();
function DashboardScreen({ navigation }: any) {
  return (
    <ScreenContainer title="Dashboard">
      <BigButton label="Add an Item to Rent" onPress={() => navigation.navigate('AddManageTab' as never)} />
      <BigButton label="Find an Item to Rent" onPress={() => navigation.navigate('BrowseTab' as never)} />
      <BigButton label="My Bookings" onPress={() => navigation.navigate('BookingsTab' as never)} />
      <BigButton label="Messages" onPress={() => navigation.navigate('Messages', { who: 'Support' })} />
      <BigButton label="Profile & Payments" onPress={() => navigation.navigate('ProfileTab' as never)} />
    </ScreenContainer>
  );
}
function MessagesScreen({ navigation }: any) {
  return (
    <ScreenContainer title="Messages">
      <BigButton label="Open Chat with Alex" onPress={() => navigation.navigate('Chat', { who: 'Alex' })} />
      <BigButton label="Open Chat with Taylor" onPress={() => navigation.navigate('Chat', { who: 'Taylor' })} />
    </ScreenContainer>
  );
}
function ChatScreen({ route }: any) {
  const who = route?.params?.who ?? 'User';
  return <ScreenContainer title={`Chat with ${who}`} />;
}
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
      <HomeStack.Screen name="Messages" component={MessagesScreen} />
      <HomeStack.Screen name="Chat" component={ChatScreen} />
    </HomeStack.Navigator>
  );
}

/* ---------- Browse (search + favorites + cart/checkout) ---------- */
type BrowseStackParams = {
  Browse: undefined;
  ToolDetails: { id: string };
  Favorites: undefined;
  Cart: undefined;
  Checkout: undefined;
};
const BrowseStack = createNativeStackNavigator<BrowseStackParams>();

function SearchControls({
  query, setQuery, category, setCategory, minPrice, setMinPrice, maxPrice, setMaxPrice,
}: {
  query: string; setQuery: (s: string) => void;
  category: string; setCategory: (s: string) => void;
  minPrice: string; setMinPrice: (s: string) => void;
  maxPrice: string; setMaxPrice: (s: string) => void;
}) {
  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder="Search name… (e.g., drill)"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />
      <CategoryPicker value={category} onPick={setCategory} />
      <View style={{ flexDirection: 'row' }}>
        <TextInput
          style={[styles.input, { flex: 1, marginRight: 10 }]}
          placeholder="Min $"
          keyboardType="numeric"
          value={minPrice}
          onChangeText={setMinPrice}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Max $"
          keyboardType="numeric"
          value={maxPrice}
          onChangeText={setMaxPrice}
        />
      </View>
    </View>
  );
}

function ToolRow({
  item, onOpen, onToggleFav, isFav,
}: {
  item: Tool;
  onOpen: () => void;
  onToggleFav: () => void;
  isFav: boolean;
}) {
  return (
    <Pressable style={styles.card} onPress={onOpen}>
      <View style={{ flexDirection: 'row' }}>
        {item.photoUri ? (
          <Image source={{ uri: item.photoUri }} style={{ width: 56, height: 56, borderRadius: 8, marginRight: 10 }} />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700' }}>
            {item.name} · ${item.pricePerDay.toFixed(2)}/day
          </Text>
          <Text style={{ color: '#555' }}>{catLabel(item.category)}</Text>
          {item.description ? (
            <Text numberOfLines={2} style={{ color: '#666' }}>
              {item.description}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={onToggleFav} hitSlop={10} style={{ paddingLeft: 8, justifyContent: 'center' }}>
          <Ionicons name={isFav ? 'star' : 'star-outline'} size={22} color={isFav ? '#f5a623' : '#999'} />
        </Pressable>
      </View>
    </Pressable>
  );
}

function BrowseScreen({ navigation }: any) {
  const { tools, isFav, toggleFav } = useTools();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(''); // '' = all
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = minPrice ? parseFloat(minPrice) : -Infinity;
    const max = maxPrice ? parseFloat(maxPrice) : Infinity;

    return tools
      .filter(t => !t.archived)
      .filter(t => (q ? t.name.toLowerCase().includes(q) : true))
      .filter(t => (category ? t.category === category : true))
      .filter(t => t.pricePerDay >= min && t.pricePerDay <= max)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tools, query, category, minPrice, maxPrice]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <FlatList
        ListHeaderComponent={
          <View style={styles.container}>
            <Text style={styles.h1}>Browse & Search</Text>
            <SearchControls
              query={query}
              setQuery={setQuery}
              category={category}
              setCategory={setCategory}
              minPrice={minPrice}
              setMinPrice={setMinPrice}
              maxPrice={maxPrice}
              setMaxPrice={setMaxPrice}
            />
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Pressable style={[styles.btn, { marginRight: 8 }]} onPress={() => navigation.navigate('Favorites')}>
                <Text style={styles.btnTxt}>Favorites</Text>
              </Pressable>
              <Pressable style={[styles.btn]} onPress={() => navigation.navigate('Cart')}>
                <Text style={styles.btnTxt}>Cart</Text>
              </Pressable>
            </View>
          </View>
        }
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <ToolRow
            item={item}
            onOpen={() => navigation.navigate('ToolDetails', { id: item.id })}
            onToggleFav={() => toggleFav(item.id)}
            isFav={isFav(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={{ padding: 16 }}>
            <Text style={{ color: '#666' }}>No results. Try clearing filters.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

  const { tools, isFav, toggleFav } = useTools();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(''); // '' = all
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

