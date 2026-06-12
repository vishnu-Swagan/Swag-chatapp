import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInRight, FadeInLeft, FadeIn, FadeOut } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import AttachmentSheet, { AttachKind } from "@/src/components/AttachmentSheet";
import Avatar from "@/src/components/Avatar";
import DocumentBubble from "@/src/components/DocumentBubble";
import LocationBubble from "@/src/components/LocationBubble";
import ReactionPicker from "@/src/components/ReactionPicker";
import { Toast, useToast } from "@/src/components/Toast";
import VoiceBubble from "@/src/components/VoiceBubble";
import VoiceRecorder from "@/src/components/VoiceRecorder";
import { useAuth } from "@/src/context/AuthContext";
import { useSocket } from "@/src/context/SocketContext";
import { C, R, SP } from "@/src/theme";
import { safety } from "@/src/utils/safety";
import { activateScreenshotProtection } from "@/src/utils/screenshotGuard";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  type: "text" | "image" | "video" | "audio" | "location" | "document";
  text: string | null;
  image_base64: string | null;
  video_base64?: string | null;
  audio_base64?: string | null;
  document_base64?: string | null;
  document_name?: string | null;
  document_mime?: string | null;
  document_size?: number | null;
  duration_ms?: number | null;
  waveform?: number[] | null;
  latitude?: number | null;
  longitude?: number | null;
  location_label?: string | null;
  view_once?: boolean;
  viewed_at?: string | null;
  deleted_for_everyone?: boolean;
  reply_to_id?: string | null;
  reply_preview?: {
    id: string;
    sender_id: string;
    type: string;
    text?: string;
    document_name?: string;
  } | null;
  reactions?: Record<string, string>;
  status: "sent" | "delivered" | "read";
  created_at: string;
};

const DELETE_WINDOW_MIN = 60;

export default function ChatRoom() {
  const { id, username } = useLocalSearchParams<{
    id: string;
    username: string;
  }>();
  const { user } = useAuth();
  const { subscribe } = useSocket();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [viewOnceMode, setViewOnceMode] = useState(false);
  const [viewer, setViewer] = useState<Message | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactionFor, setReactionFor] = useState<Message | null>(null);
  const [recording, setRecording] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [friendImage, setFriendImage] = useState<string | null>(null);
  const typingSentAtRef = useRef(0);
  const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendId = id as string;
  const myId = user?.id;
  const inputRef = useRef<TextInput>(null);

  const markRead = useCallback(() => {
    api(`/chats/${friendId}/read`, { method: "POST" }).catch(() => {});
  }, [friendId]);

  useEffect(() => {
    api<Message[]>(`/messages/${friendId}`)
      .then((m) => {
        setMessages(m);
        markRead();
      })
      .catch((e) => {
        toast.show(e.message);
        setMessages([]);
      });
    api<{ profile_image_base64?: string }>(`/profile/image/${friendId}`)
      .then((r) => setFriendImage(r.profile_image_base64 || null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId]);

  // Screenshot protection while inside the chat
  useEffect(() => {
    const cleanup = activateScreenshotProtection({
      context: "chat",
      chatWith: friendId,
      onScreenshot: () =>
        toast.show(
          "⚠️ Screenshots are not allowed. @" + username + " has been notified.",
        ),
    });
    return cleanup;
  }, [friendId, username, toast]);

  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type === "message:new" && msg.message?.sender_id === friendId) {
          setMessages((p) => [msg.message, ...(p || [])]);
          markRead();
        }
        if (msg.type === "messages:read" && msg.by === friendId) {
          setMessages((p) =>
            (p || []).map((m) =>
              m.sender_id === myId ? { ...m, status: "read" } : m,
            ),
          );
        }
        if (msg.type === "message:deleted") {
          setMessages((p) =>
            (p || []).map((m) =>
              m.id === msg.message_id
                ? { ...m, deleted_for_everyone: true, text: null, image_base64: null }
                : m,
            ),
          );
        }
        if (msg.type === "message:viewed") {
          setMessages((p) =>
            (p || []).map((m) =>
              m.id === msg.message_id
                ? { ...m, viewed_at: new Date().toISOString(), image_base64: null }
                : m,
            ),
          );
        }
        if (msg.type === "safety:screenshot" && msg.by?.id === friendId) {
          toast.show(
            "⚠️ @" + (msg.by.username || username) + " took a screenshot of this chat.",
          );
        }
        if (msg.type === "typing" && msg.from === friendId) {
          setOtherTyping(!!msg.typing);
          if (msg.typing) {
            if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
            typingClearTimerRef.current = setTimeout(() => setOtherTyping(false), 4000);
          }
        }
        if (msg.type === "message:reaction") {
          setMessages((p) =>
            (p || []).map((m) =>
              m.id === msg.message_id ? { ...m, reactions: msg.reactions } : m,
            ),
          );
        }
      }),
    [subscribe, friendId, myId, markRead, toast, username],
  );

  const signalTyping = useCallback(
    (isTyping: boolean) => {
      const now = Date.now();
      if (isTyping && now - typingSentAtRef.current < 2500) return;
      typingSentAtRef.current = now;
      api("/typing", {
        method: "POST",
        body: { to_user_id: friendId, typing: isTyping },
      }).catch(() => {});
    },
    [friendId],
  );

  const onTextChange = (v: string) => {
    setText(v);
    signalTyping(!!v.trim());
  };

  const sendText = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    const replyId = replyTo?.id || null;
    setReplyTo(null);
    try {
      const msg = await api<Message>("/messages", {
        method: "POST",
        body: { to_user_id: friendId, type: "text", text: t, reply_to_id: replyId },
      });
      setMessages((p) => [msg, ...(p || [])]);
      signalTyping(false);
    } catch (e: any) {
      toast.show(e.message);
      setText(t);
    } finally {
      setSending(false);
    }
  };

  const _sendMedia = async (payload: Record<string, any>, label?: string) => {
    setSending(true);
    const replyId = replyTo?.id || null;
    setReplyTo(null);
    try {
      const msg = await api<Message>("/messages", {
        method: "POST",
        body: { to_user_id: friendId, reply_to_id: replyId, ...payload },
      });
      setMessages((p) => [msg, ...(p || [])]);
      if (label) toast.show(label);
    } catch (e: any) {
      toast.show(e.message || "Could not send");
    } finally {
      setSending(false);
    }
  };

  const sendImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.3,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    await _sendMedia({
      type: "image",
      image_base64: res.assets[0].base64,
      view_once: viewOnceMode,
    }, viewOnceMode ? "👁 View-once photo sent." : undefined);
    if (viewOnceMode) setViewOnceMode(false);
  };

  const sendFromCamera = async () => {
    if (Platform.OS === "web") {
      sendImage();
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.show("Camera permission needed");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.3,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    await _sendMedia({ type: "image", image_base64: res.assets[0].base64 });
  };

  const sendVideo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 20,
      quality: 0.4,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    try {
      let base64 = res.assets[0].base64 as string | undefined;
      const uri = res.assets[0].uri;
      if (!base64) {
        if (Platform.OS === "web") {
          const blob = await (await fetch(uri)).blob();
          const buf = await blob.arrayBuffer();
          base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        } else {
          const FS = await import("expo-file-system");
          base64 = await (FS as any).readAsStringAsync(uri, { encoding: "base64" });
        }
      }
      if (!base64) {
        toast.show("Could not read video");
        return;
      }
      if (base64.length > 4_000_000) {
        toast.show("Video too large (max ~3MB). Try a shorter clip.");
        return;
      }
      await _sendMedia({
        type: "video",
        video_base64: base64,
        duration_ms: res.assets[0].duration ?? null,
      });
    } catch (e: any) {
      toast.show(e.message || "Could not send video");
    }
  };

  const sendDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const f = res.assets[0];
      let base64 = "";
      if (Platform.OS === "web") {
        // file is a uri starting with blob: or data:
        const blob = await (await fetch(f.uri)).blob();
        const buf = await blob.arrayBuffer();
        base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      } else {
        const FS = await import("expo-file-system");
        base64 = await (FS as any).readAsStringAsync(f.uri, { encoding: "base64" });
      }
      if (base64.length > 3_500_000) {
        toast.show("Document too large (max ~2.5MB)");
        return;
      }
      await _sendMedia({
        type: "document",
        document_base64: base64,
        document_name: f.name,
        document_mime: f.mimeType || "application/octet-stream",
        document_size: f.size ?? null,
      });
    } catch (e: any) {
      toast.show(e.message || "Could not send document");
    }
  };

  const sendLocation = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        toast.show("Location permission needed");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await _sendMedia({
        type: "location",
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        location_label: "Current location",
      }, "📍 Location shared");
    } catch (e: any) {
      toast.show(e.message || "Could not share location");
    }
  };

  const sendVoice = async ({ base64, durationMs, waveform }: { base64: string; durationMs: number; waveform: number[] }) => {
    if (!base64) return;
    setRecording(false);
    await _sendMedia({
      type: "audio",
      audio_base64: base64,
      duration_ms: durationMs,
      waveform,
    });
  };

  const toggleReaction = async (m: Message, emoji: string) => {
    try {
      const res = await api<{ reactions: Record<string, string> }>("/messages/react", {
        method: "POST",
        body: { message_id: m.id, emoji },
      });
      setMessages((p) =>
        (p || []).map((mm) => (mm.id === m.id ? { ...mm, reactions: res.reactions } : mm)),
      );
    } catch (e: any) {
      toast.show(e.message || "Could not react");
    } finally {
      setReactionFor(null);
    }
  };

  const onAttachPick = (kind: AttachKind) => {
    if (kind === "image") sendImage();
    else if (kind === "camera") sendFromCamera();
    else if (kind === "video") sendVideo();
    else if (kind === "document") sendDocument();
    else if (kind === "location") sendLocation();
  };

  const startCall = (video: boolean) => {
    if (Platform.OS !== "web") {
      toast.show("Calls need a development build — try the web preview.");
      return;
    }
    router.push(
      `/call/${friendId}?video=${video ? 1 : 0}&role=caller&username=${username}`,
    );
  };

  const handleBlock = () => {
    const doBlock = async () => {
      try {
        await safety.block(friendId);
        toast.show("🚫 @" + username + " has been blocked.");
        setTimeout(() => router.back(), 600);
      } catch (e: any) {
        toast.show(e.message || "Could not block");
      }
    };
    if (Platform.OS === "web") {
      if (confirm(`Block @${username}? They won't be able to contact you.`))
        doBlock();
    } else {
      Alert.alert(
        `Block @${username}?`,
        "They won't be able to message or call you. You can unblock anytime in Profile → Blocked Users.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Block", style: "destructive", onPress: doBlock },
        ],
      );
    }
    setMenuOpen(false);
  };

  const submitReport = async () => {
    if (reportText.trim().length < 3) {
      toast.show("Please describe the issue (min 3 characters)");
      return;
    }
    try {
      await safety.report(friendId, reportText.trim());
      setReportOpen(false);
      setReportText("");
      toast.show(
        "✅ Report submitted. @" + username + " has been blocked from contacting you.",
      );
      setTimeout(() => router.back(), 800);
    } catch (e: any) {
      toast.show(e.message || "Could not submit report");
    }
  };

  const onLongPressMessage = (m: Message) => {
    if (m.deleted_for_everyone) return;
    setReactionFor(m);
  };

  const canDeleteForEveryone = (m: Message) => {
    if (m.sender_id !== myId || m.deleted_for_everyone) return false;
    const age = (Date.now() - new Date(m.created_at).getTime()) / 1000 / 60;
    return age <= DELETE_WINDOW_MIN;
  };

  const doDeleteForEveryone = async () => {
    if (!selectedMsg) return;
    try {
      await safety.deleteForEveryone(selectedMsg.id);
      setMessages((p) =>
        (p || []).map((mm) =>
          mm.id === selectedMsg.id
            ? {
                ...mm,
                deleted_for_everyone: true,
                text: null,
                image_base64: null,
              }
            : mm,
        ),
      );
      setSelectedMsg(null);
    } catch (e: any) {
      toast.show(e.message || "Could not delete");
    }
  };

  const openImageMessage = async (m: Message) => {
    if (m.deleted_for_everyone) return;
    if (
      m.view_once &&
      m.recipient_id === myId &&
      !m.viewed_at &&
      m.image_base64
    ) {
      setViewer(m);
      try {
        await safety.markImageViewed(m.id);
      } catch {}
      // After viewing, mark locally as viewed so it disappears from list
      setTimeout(() => {
        setMessages((p) =>
          (p || []).map((mm) =>
            mm.id === m.id
              ? { ...mm, viewed_at: new Date().toISOString() }
              : mm,
          ),
        );
      }, 100);
    } else if (m.image_base64) {
      setViewer(m);
    }
  };

  const renderStatus = (m: Message) => {
    if (m.sender_id !== myId) return null;
    const name = m.status === "sent" ? "checkmark" : "checkmark-done";
    const color = m.status === "read" ? "#FFFFFF" : "rgba(255,255,255,0.55)";
    return (
      <Ionicons name={name} size={14} color={color} style={{ marginLeft: 4 }} />
    );
  };

  const renderItem = ({ item }: { item: Message }) => {
    const mine = item.sender_id === myId;
    const isDeleted = !!item.deleted_for_everyone;
    const isViewOnceConsumed =
      item.view_once &&
      item.recipient_id === myId &&
      !!item.viewed_at &&
      !item.image_base64;
    const isViewOnceForSender =
      item.view_once && item.sender_id === myId;

    return (
      <Animated.View
        entering={(mine ? FadeInRight : FadeInLeft).duration(220).springify().damping(18)}
        style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}
      >
      <Pressable
        onLongPress={() => onLongPressMessage(item)}
        onPress={() =>
          item.type === "image" && !isDeleted && openImageMessage(item)
        }
        style={{ maxWidth: "78%" }}
      >
        <View
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            item.type === "image" && !isDeleted && styles.bubbleImage,
          ]}
          testID={`message-bubble-${item.id}`}
        >
          {item.reply_preview && !isDeleted && (
            <View style={[styles.replyBox, mine ? styles.replyBoxMine : styles.replyBoxTheirs]}>
              <Text style={[styles.replyAuthor, mine && { color: "rgba(255,255,255,0.85)" }]} numberOfLines={1}>
                {item.reply_preview.sender_id === myId ? "You" : `@${username}`}
              </Text>
              <Text style={[styles.replyText, mine && { color: "rgba(255,255,255,0.75)" }]} numberOfLines={2}>
                {item.reply_preview.text
                  || (item.reply_preview.type === "image" ? "📷 Photo"
                    : item.reply_preview.type === "video" ? "🎬 Video"
                    : item.reply_preview.type === "audio" ? "🎙 Voice note"
                    : item.reply_preview.type === "location" ? "📍 Location"
                    : item.reply_preview.type === "document" ? `📄 ${item.reply_preview.document_name || "Document"}`
                    : "Message")}
              </Text>
            </View>
          )}
          {isDeleted ? (
            <View style={styles.deletedRow}>
              <Ionicons
                name="ban-outline"
                size={14}
                color={mine ? "rgba(255,255,255,0.55)" : C.muted}
              />
              <Text style={mine ? styles.deletedTextMine : styles.deletedText}>
                This message was deleted
              </Text>
            </View>
          ) : item.type === "image" ? (
            isViewOnceConsumed ? (
              <View style={styles.viewOnceConsumed}>
                <Ionicons name="eye-off-outline" size={18} color={C.muted} />
                <Text style={styles.viewOnceConsumedText}>Photo viewed</Text>
              </View>
            ) : (
              <View>
                {item.image_base64 ? (
                  <Image
                    source={{
                      uri: `data:image/jpeg;base64,${item.image_base64}`,
                    }}
                    style={styles.imageMsg}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.viewOnceConsumed}>
                    <Ionicons
                      name="eye-off-outline"
                      size={18}
                      color={C.muted}
                    />
                    <Text style={styles.viewOnceConsumedText}>
                      {isViewOnceForSender
                        ? "View-once photo"
                        : "Photo expired"}
                    </Text>
                  </View>
                )}
                {item.view_once && (
                  <View style={styles.viewOnceBadge}>
                    <Ionicons name="eye-outline" size={11} color="#fff" />
                    <Text style={styles.viewOnceBadgeText}>1</Text>
                  </View>
                )}
              </View>
            )
          ) : item.type === "video" ? (
            <Pressable onPress={() => setViewer(item)} style={styles.videoBox}>
              {item.image_base64 ? (
                <Image source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }} style={styles.imageMsg} contentFit="cover" />
              ) : (
                <View style={[styles.imageMsg, { backgroundColor: "#000", alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="videocam" size={36} color="#FFFFFF" />
                </View>
              )}
              <View style={styles.videoPlayOverlay}>
                <Ionicons name="play" size={24} color="#FFFFFF" />
              </View>
            </Pressable>
          ) : item.type === "audio" ? (
            <VoiceBubble
              base64={item.audio_base64 || null}
              durationMs={item.duration_ms || null}
              waveform={item.waveform || null}
              mine={mine}
            />
          ) : item.type === "location" ? (
            <LocationBubble
              latitude={item.latitude}
              longitude={item.longitude}
              label={item.location_label}
              mine={mine}
            />
          ) : item.type === "document" ? (
            <DocumentBubble
              name={item.document_name || "Document"}
              mime={item.document_mime}
              size={item.document_size}
              base64={item.document_base64}
              mine={mine}
            />
          ) : (
            <Text style={mine ? styles.textMine : styles.textTheirs}>
              {item.text}
            </Text>
          )}
          <View style={styles.metaRow}>
            <Text
              style={[
                styles.timeText,
                mine ? styles.timeMine : styles.timeTheirs,
              ]}
            >
              {dayjs(item.created_at).format("HH:mm")}
            </Text>
            {renderStatus(item)}
          </View>
          {item.reactions && Object.keys(item.reactions).length > 0 && (
            <View style={styles.reactionsRow}>
              {Object.entries(
                Object.values(item.reactions).reduce((acc: Record<string, number>, e) => {
                  acc[e] = (acc[e] || 0) + 1;
                  return acc;
                }, {}),
              ).map(([emoji, count]) => (
                <View key={emoji} style={styles.reactionPill}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
                </View>
              ))}
            </View>
          )}
        </View>
      </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container} testID="chat-room-screen">
      <View style={[styles.header, { paddingTop: insets.top + SP.sm }]}>
        <Pressable
          testID="chat-back-button"
          onPress={() => router.back()}
          style={styles.headerBtn}
        >
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Avatar username={(username as string) || "?"} size={36} imageBase64={friendImage} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>
            @{username}
          </Text>
          <View style={styles.secureRow}>
            <Ionicons name="lock-closed" size={10} color={C.muted} />
            <Text style={styles.secureText}>Verified · Screenshots blocked</Text>
          </View>
        </View>
        <Pressable
          testID="chat-voice-call-button"
          onPress={() => startCall(false)}
          style={styles.headerBtn}
        >
          <Ionicons name="call-outline" size={22} color={C.onSurface} />
        </Pressable>
        <Pressable
          testID="chat-video-call-button"
          onPress={() => startCall(true)}
          style={styles.headerBtn}
        >
          <Ionicons name="videocam-outline" size={24} color={C.onSurface} />
        </Pressable>
        <Pressable
          testID="chat-menu-button"
          onPress={() => setMenuOpen(true)}
          style={styles.headerBtn}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={C.onSurface} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="translate-with-padding"
        keyboardVerticalOffset={0}
      >
        {messages === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.onSurface} />
          </View>
        ) : (
          <FlatList
            inverted
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap} testID="chat-empty-state">
                <Text style={styles.emptyText}>Say hi to @{username} 👋</Text>
              </View>
            }
          />
        )}

        {otherTyping && (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={styles.typingRow}
            testID="chat-typing-indicator"
          >
            <View style={styles.typingDots}>
              <View style={styles.dot} />
              <View style={[styles.dot, { opacity: 0.6 }]} />
              <View style={[styles.dot, { opacity: 0.3 }]} />
            </View>
            <Text style={styles.typingText}>@{username} is typing…</Text>
          </Animated.View>
        )}

        {replyTo && (
          <Animated.View entering={FadeIn.duration(160)} style={styles.replyBar}>
            <View style={styles.replyAccent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyBarAuthor}>
                Replying to {replyTo.sender_id === myId ? "yourself" : `@${username}`}
              </Text>
              <Text style={styles.replyBarText} numberOfLines={1}>
                {replyTo.text
                  || (replyTo.type === "image" ? "📷 Photo"
                    : replyTo.type === "video" ? "🎬 Video"
                    : replyTo.type === "audio" ? "🎙 Voice note"
                    : replyTo.type === "location" ? "📍 Location"
                    : replyTo.type === "document" ? `📄 ${replyTo.document_name || "Document"}`
                    : "Message")}
              </Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={10} testID="reply-cancel">
              <Ionicons name="close" size={18} color={C.muted} />
            </Pressable>
          </Animated.View>
        )}

        {viewOnceMode && (
          <View style={styles.viewOnceBanner}>
            <Ionicons name="eye-outline" size={14} color={C.onInverse} />
            <Text style={styles.viewOnceBannerText}>
              View-once photo mode · next photo disappears after viewing
            </Text>
            <Pressable onPress={() => setViewOnceMode(false)} hitSlop={8}>
              <Ionicons name="close" size={16} color={C.onInverse} />
            </Pressable>
          </View>
        )}

        <View
          style={[
            styles.inputBar,
            { paddingBottom: Math.max(insets.bottom, SP.md) },
          ]}
        >
          {recording ? (
            <VoiceRecorder onComplete={sendVoice} onCancel={() => setRecording(false)} />
          ) : (
            <>
              <Pressable
                testID="chat-attach-button"
                onPress={() => setAttachOpen(true)}
                style={styles.attachBtn}
                disabled={sending}
              >
                <Ionicons name="add" size={26} color={C.mutedDark} />
              </Pressable>
              <Pressable
                testID="chat-view-once-toggle"
                onPress={() => setViewOnceMode((v) => !v)}
                style={[
                  styles.attachBtn,
                  viewOnceMode && { backgroundColor: C.surface2, borderRadius: 22 },
                ]}
              >
                <Ionicons
                  name={viewOnceMode ? "eye" : "eye-outline"}
                  size={22}
                  color={viewOnceMode ? C.onSurface : C.mutedDark}
                />
              </Pressable>
              <TextInput
                ref={inputRef}
                testID="chat-text-input"
                style={styles.input}
                placeholder="Message"
                placeholderTextColor={C.muted}
                value={text}
                onChangeText={onTextChange}
                onBlur={() => signalTyping(false)}
                multiline
              />
              {text.trim() ? (
                <Pressable
                  testID="chat-send-button"
                  onPress={sendText}
                  style={[styles.sendBtn, sending && { opacity: 0.35 }]}
                  disabled={sending}
                >
                  <Ionicons name="arrow-up" size={20} color={C.onInverse} />
                </Pressable>
              ) : (
                <Pressable
                  testID="chat-voice-button"
                  onPress={() => setRecording(true)}
                  style={styles.attachBtn}
                  disabled={sending}
                >
                  <Ionicons name="mic" size={22} color={C.onSurface} />
                </Pressable>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Header menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}>
          <View
            style={[styles.menuCard, { top: insets.top + 56, right: SP.md }]}
          >
            <Pressable
              testID="chat-menu-block"
              style={styles.menuItem}
              onPress={handleBlock}
            >
              <Ionicons name="ban-outline" size={18} color={C.onSurface} />
              <Text style={styles.menuItemText}>Block @{username}</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              testID="chat-menu-report"
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
            >
              <Ionicons name="flag-outline" size={18} color={C.onSurface} />
              <Text style={styles.menuItemText}>Report user</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Report modal */}
      <Modal
        visible={reportOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReportOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setReportOpen(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + SP.lg },
            ]}
            onPress={() => {}}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Report @{username}</Text>
            <Text style={styles.sheetBody}>
              Tell us what happened. Reports are reviewed by our safety team
              and this user will be blocked from contacting you immediately.
            </Text>
            <TextInput
              testID="chat-report-input"
              value={reportText}
              onChangeText={setReportText}
              placeholder="Describe the issue…"
              placeholderTextColor={C.muted}
              multiline
              style={styles.reportInput}
            />
            <Pressable
              testID="chat-report-submit"
              onPress={submitReport}
              style={styles.reportCta}
            >
              <Text style={styles.reportCtaText}>Submit report & Block</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete-for-everyone confirm */}
      <Modal
        visible={!!selectedMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMsg(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedMsg(null)}
        >
          <Pressable
            style={[styles.confirmCard, { paddingBottom: insets.bottom + SP.lg }]}
            onPress={() => {}}
          >
            <Text style={styles.sheetTitle}>Delete message?</Text>
            <Text style={styles.sheetBody}>
              This will remove the message for both you and @{username}. You
              can only delete messages within {DELETE_WINDOW_MIN} minutes of
              sending.
            </Text>
            <View style={styles.confirmRow}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmCancel]}
                onPress={() => setSelectedMsg(null)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="chat-delete-confirm"
                style={[styles.confirmBtn, styles.confirmDelete]}
                onPress={doDeleteForEveryone}
              >
                <Text style={styles.confirmDeleteText}>Delete for everyone</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Image viewer */}
      <Modal
        visible={!!viewer}
        transparent
        animationType="fade"
        onRequestClose={() => setViewer(null)}
      >
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)}>
          {viewer?.image_base64 && (
            <Image
              source={{
                uri: `data:image/jpeg;base64,${viewer.image_base64}`,
              }}
              style={styles.viewerImg}
              contentFit="contain"
            />
          )}
          {viewer?.view_once && (
            <View style={styles.viewerHint}>
              <Ionicons name="eye-outline" size={14} color="#fff" />
              <Text style={styles.viewerHintText}>View-once · disappears when closed</Text>
            </View>
          )}
        </Pressable>
      </Modal>

      <AttachmentSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPick={onAttachPick}
      />

      <ReactionPicker
        visible={!!reactionFor}
        onClose={() => setReactionFor(null)}
        onPick={(emoji) => reactionFor && toggleReaction(reactionFor, emoji)}
        mine={reactionFor?.sender_id === myId}
      />

      {reactionFor && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setReactionFor(null)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setReactionFor(null)}>
            <View style={styles.msgActionsSheet}>
              <Pressable
                style={styles.msgAction}
                onPress={() => {
                  setReplyTo(reactionFor);
                  setReactionFor(null);
                }}
              >
                <Ionicons name="arrow-undo" size={18} color={C.onSurface} />
                <Text style={styles.msgActionText}>Reply</Text>
              </Pressable>
              {canDeleteForEveryone(reactionFor) && (
                <Pressable
                  style={styles.msgAction}
                  onPress={() => {
                    setSelectedMsg(reactionFor);
                    setReactionFor(null);
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={C.error} />
                  <Text style={[styles.msgActionText, { color: C.error }]}>Delete for everyone</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Modal>
      )}

      <Toast message={toast.message} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.sm,
    paddingBottom: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    backgroundColor: C.surface,
    gap: SP.sm,
  },
  headerBtn: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  headerName: { fontSize: 16, fontWeight: "700", color: C.onSurface },
  secureRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  secureText: { fontSize: 10, color: C.muted, fontWeight: "500" },
  listContent: { paddingHorizontal: SP.lg, paddingVertical: SP.md, flexGrow: 1 },
  bubbleRow: { marginVertical: 3, flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: R.md, paddingHorizontal: SP.md, paddingVertical: SP.sm },
  bubbleMine: { backgroundColor: C.inverse, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: C.surface3, borderBottomLeftRadius: 4 },
  bubbleImage: { padding: 4 },
  imageMsg: { width: 220, height: 220, borderRadius: R.sm },
  textMine: { color: C.onInverse, fontSize: 15, lineHeight: 21 },
  textTheirs: { color: C.onSurface3, fontSize: 15, lineHeight: 21 },
  deletedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  deletedText: { color: C.muted, fontSize: 14, fontStyle: "italic" },
  deletedTextMine: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontStyle: "italic" },
  viewOnceConsumed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.lg,
    width: 220,
    justifyContent: "center",
  },
  viewOnceConsumedText: { color: C.muted, fontSize: 13 },
  viewOnceBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  viewOnceBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 2,
  },
  timeText: { fontSize: 10 },
  timeMine: { color: "rgba(255,255,255,0.6)" },
  timeTheirs: { color: C.muted },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ scaleY: -1 }],
  },
  emptyText: { fontSize: 15, color: C.muted },
  viewOnceBanner: {
    backgroundColor: C.inverse,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
    gap: SP.sm,
  },
  viewOnceBannerText: { color: C.onInverse, fontSize: 12, flex: 1 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: SP.md,
    paddingTop: SP.sm,
    borderTopWidth: 1,
    borderTopColor: C.divider,
    backgroundColor: C.surface,
    gap: 4,
  },
  attachBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: R.lg,
    backgroundColor: C.surface2,
    paddingHorizontal: SP.lg,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: C.onSurface,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.inverse,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  menuCard: {
    position: "absolute",
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingVertical: 4,
    minWidth: 200,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
  },
  menuItemText: { fontSize: 14, color: C.onSurface, fontWeight: "500" },
  menuDivider: { height: 1, backgroundColor: C.divider },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SP.xl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginBottom: SP.lg,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.onSurface },
  sheetBody: { fontSize: 13, color: C.mutedDark, lineHeight: 19, marginTop: SP.sm },
  reportInput: {
    marginTop: SP.lg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    padding: SP.md,
    minHeight: 100,
    fontSize: 15,
    color: C.onSurface,
    textAlignVertical: "top",
  },
  reportCta: {
    marginTop: SP.lg,
    height: 50,
    backgroundColor: C.inverse,
    borderRadius: R.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  reportCtaText: { color: C.onInverse, fontSize: 15, fontWeight: "700" },
  confirmCard: {
    margin: SP.xl,
    marginTop: "auto",
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: SP.xl,
  },
  confirmRow: { flexDirection: "row", gap: SP.md, marginTop: SP.lg },
  confirmBtn: { flex: 1, height: 46, borderRadius: R.pill, alignItems: "center", justifyContent: "center" },
  confirmCancel: { borderWidth: 1, borderColor: C.borderStrong },
  confirmCancelText: { color: C.onSurface, fontWeight: "700" },
  confirmDelete: { backgroundColor: C.inverse },
  confirmDeleteText: { color: C.onInverse, fontWeight: "700" },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImg: { width: "100%", height: "80%" },
  viewerHint: {
    position: "absolute",
    bottom: 50,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  viewerHintText: { color: "#fff", fontSize: 12 },
  videoBox: { position: "relative" },
  videoPlayOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  replyBox: {
    borderLeftWidth: 3,
    paddingLeft: SP.sm,
    paddingVertical: 4,
    paddingRight: SP.sm,
    marginBottom: 6,
    borderRadius: 4,
  },
  replyBoxMine: { borderLeftColor: "rgba(255,255,255,0.7)", backgroundColor: "rgba(255,255,255,0.12)" },
  replyBoxTheirs: { borderLeftColor: C.onSurface, backgroundColor: C.surface2 },
  replyAuthor: { fontSize: 11, fontWeight: "700", color: C.onSurface },
  replyText: { fontSize: 12, color: C.mutedDark, marginTop: 1 },
  replyBar: {
    flexDirection: "row", alignItems: "center", gap: SP.sm,
    paddingHorizontal: SP.lg, paddingVertical: SP.sm,
    backgroundColor: C.surface2, borderTopWidth: 1, borderTopColor: C.divider,
  },
  replyAccent: { width: 3, alignSelf: "stretch", backgroundColor: C.onSurface, borderRadius: 2 },
  replyBarAuthor: { fontSize: 12, fontWeight: "700", color: C.onSurface },
  replyBarText: { fontSize: 12, color: C.muted, marginTop: 1 },
  reactionsRow: {
    flexDirection: "row", gap: 4, marginTop: 4,
    position: "absolute", bottom: -10, right: 6,
  },
  reactionPill: {
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
  },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 10, fontWeight: "700", color: C.onSurface },
  typingRow: {
    flexDirection: "row", alignItems: "center", gap: SP.sm,
    paddingHorizontal: SP.xl, paddingTop: 4, paddingBottom: 4,
  },
  typingDots: { flexDirection: "row", gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.muted },
  typingText: { fontSize: 12, color: C.muted, fontStyle: "italic" },
  msgActionsSheet: {
    backgroundColor: C.surface, borderRadius: R.lg, marginHorizontal: SP.xl,
    paddingVertical: SP.sm, alignSelf: "stretch",
  },
  msgAction: {
    flexDirection: "row", alignItems: "center", gap: SP.md,
    paddingHorizontal: SP.lg, paddingVertical: SP.md,
  },
  msgActionText: { fontSize: 15, color: C.onSurface, fontWeight: "600" },
});
