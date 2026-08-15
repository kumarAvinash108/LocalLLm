import 'react-native-gesture-handler';
import React, { useState } from 'react';
import {
  StatusBar,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  I18nManager,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Drawer } from 'react-native-drawer-layout';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import './src/i18n';
import { ChatProvider, useChat } from './src/context/ChatContext';
import { ChatScreen } from './src/screens/ChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { HistoryItem } from './src/components/HistoryItem';
import { Colors } from './src/theme/colors';
import { Conversation } from './src/types';

const Stack = createNativeStackNavigator();

function SidebarContent({ onNewChat, onSelectChat, onDeleteChat, onOpenSettings }: {
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const { conversations, activeConversationId } = useChat();
  const insets = useSafeAreaInsets();

  const now = Date.now();
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  const groups: { title: string; data: Conversation[] }[] = [];
  const todayItems = conversations.filter((c) => c.updatedAt >= today);
  const yesterdayItems = conversations.filter((c) => c.updatedAt >= yesterday && c.updatedAt < today);
  const weekItems = conversations.filter((c) => c.updatedAt >= weekAgo && c.updatedAt < yesterday);
  const olderItems = conversations.filter((c) => c.updatedAt < weekAgo);

  if (todayItems.length) groups.push({ title: t('sidebar.today'), data: todayItems });
  if (yesterdayItems.length) groups.push({ title: t('sidebar.yesterday'), data: yesterdayItems });
  if (weekItems.length) groups.push({ title: t('sidebar.previousDays'), data: weekItems });
  if (olderItems.length) groups.push({ title: t('sidebar.older'), data: olderItems });

  return (
    <View style={styles.drawerContainer}>
      <View style={[styles.drawerHeader, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.newChatButton} onPress={onNewChat} activeOpacity={0.7}>
          <Ionicons name="add" size={20} color={Colors.dark.text} />
          <Text style={styles.newChatText}>{t('sidebar.newChat')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.drawerScroll}>
        {conversations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubble-outline" size={32} color={Colors.dark.textTertiary} />
            <Text style={styles.emptyText}>{t('sidebar.noChats')}</Text>
          </View>
        ) : (
          groups.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.data.map((conv) => (
                <HistoryItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  onPress={() => onSelectChat(conv.id)}
                  onDelete={() => onDeleteChat(conv.id)}
                />
              ))}
            </View>
          ))
        )}
      </View>

      <View style={styles.drawerFooter}>
        <TouchableOpacity style={styles.settingsButton} onPress={onOpenSettings} activeOpacity={0.7}>
          <Ionicons name="settings-outline" size={20} color={Colors.dark.textSecondary} />
          <Text style={styles.settingsText}>{t('sidebar.settings')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MainScreen({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { createNewChat, selectChat, deleteChat, activeConversation } = useChat();

  const isRTL = I18nManager.isRTL;
  const insets = useSafeAreaInsets();

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <Drawer
      open={drawerOpen}
      onOpen={() => setDrawerOpen(true)}
      onClose={closeDrawer}
      drawerPosition={isRTL ? 'right' : 'left'}
      drawerType="front"
      drawerStyle={{ width: 280, backgroundColor: Colors.dark.sidebarBackground }}
      overlayStyle={{ backgroundColor: Colors.dark.overlay }}
      renderDrawerContent={() => (
        <SidebarContent
          onNewChat={() => {
            createNewChat();
            closeDrawer();
          }}
          onSelectChat={(id) => {
            selectChat(id);
            closeDrawer();
          }}
          onDeleteChat={(id) => deleteChat(id)}
          onOpenSettings={() => {
            closeDrawer();
            navigation.navigate('Settings');
          }}
        />
      )}>
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
        <View style={[styles.headerBar, { paddingTop: insets.top }]}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setDrawerOpen(true)}
            activeOpacity={0.7}>
            <Ionicons name="menu" size={24} color={Colors.dark.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {activeConversation?.title ?? t('app.name')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <ChatScreen />
      </View>
    </Drawer>
  );
}

function RootNavigator() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainScreen} />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: true,
          headerTitle: t('settings.title'),
          headerStyle: {
            backgroundColor: Colors.dark.background,
          },
          headerTintColor: Colors.dark.text,
          headerTitleStyle: {
            fontWeight: '600',
          },
          headerBackTitle: '',
        }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <ChatProvider>
        <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: Colors.dark.primary,
            background: Colors.dark.background,
            card: Colors.dark.surface,
            text: Colors.dark.text,
            border: Colors.dark.border,
            notification: Colors.dark.primary,
          },
          fonts: {
            regular: { fontFamily: 'System', fontWeight: '400' },
            medium: { fontFamily: 'System', fontWeight: '500' },
            bold: { fontFamily: 'System', fontWeight: '700' },
            heavy: { fontFamily: 'System', fontWeight: '900' },
          },
        }}>
          <RootNavigator />
        </NavigationContainer>
      </ChatProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    backgroundColor: Colors.dark.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 44,
  },
  drawerContainer: {
    flex: 1,
    backgroundColor: Colors.dark.sidebarBackground,
  },
  drawerHeader: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 8,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  newChatText: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: '500',
  },
  drawerScroll: {
    flex: 1,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.dark.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textTertiary,
  },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  settingsText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
});
