import { useEffect, useMemo, useRef, useState } from "react";
import {
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { COLORS } from "../constants/theme";

const ITEM_HEIGHT = 52;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const MINUTE_STEP = 5;

const pad2 = (value) => String(value).padStart(2, "0");

const roundMinuteToStep = (minute) => {
  const rounded = Math.round(minute / MINUTE_STEP) * MINUTE_STEP;
  if (rounded >= 60) return 55;
  return rounded;
};

export default function TimePickerModal({
  visible,
  title = "เลือกเวลา",
  initialDate,
  onClose,
  onConfirm,
}) {
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);

  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, index) => index),
    []
  );

  const minuteOptions = useMemo(
    () => Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP),
    []
  );

  const [selectedHour, setSelectedHour] = useState(0);
  const [selectedMinute, setSelectedMinute] = useState(0);

  useEffect(() => {
    if (!visible) return;

    const date = initialDate ? new Date(initialDate) : new Date();
    const hour = date.getHours();
    const minute = roundMinuteToStep(date.getMinutes());

    setSelectedHour(hour);
    setSelectedMinute(minute);

    const timer = setTimeout(() => {
      hourListRef.current?.scrollToIndex({
        index: hour,
        animated: false,
      });

      const minuteIndex = minuteOptions.findIndex((item) => item === minute);

      minuteListRef.current?.scrollToIndex({
        index: Math.max(0, minuteIndex),
        animated: false,
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [visible, initialDate, minuteOptions]);

  const handleMomentumEnd = (event, data, setValue) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const rawIndex = Math.round(offsetY / ITEM_HEIGHT);
    const safeIndex = Math.max(0, Math.min(rawIndex, data.length - 1));

    setValue(data[safeIndex]);
  };

  const handleConfirm = () => {
    onConfirm?.({
      hour: selectedHour,
      minute: selectedMinute,
    });
  };

  const renderPickerColumn = (data, selectedValue, setValue, listRef) => {
    return (
      <View style={styles.pickerColumn}>
        <View pointerEvents="none" style={styles.selectedFrame} />

        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(item) => String(item)}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          removeClippedSubviews={false}
          contentContainerStyle={styles.pickerColumnContent}
          getItemLayout={(_, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          onMomentumScrollEnd={(event) =>
            handleMomentumEnd(event, data, setValue)
          }
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              listRef.current?.scrollToOffset({
                offset: index * ITEM_HEIGHT,
                animated: false,
              });
            }, 100);
          }}
          renderItem={({ item }) => {
            const active = selectedValue === item;

            return (
              <Pressable
                style={styles.timeItem}
                onPress={() => {
                  setValue(item);

                  const index = data.findIndex((value) => value === item);

                  listRef.current?.scrollToIndex({
                    index,
                    animated: true,
                  });
                }}
              >
                <Text
                  style={[
                    styles.timeItemText,
                    active && styles.timeItemTextActive,
                  ]}
                >
                  {pad2(item)}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.previewBox}>
            <Text style={styles.previewText}>{pad2(selectedHour)}</Text>
            <Text style={styles.previewColon}>:</Text>
            <Text style={styles.previewText}>{pad2(selectedMinute)}</Text>
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.columnLabel}>ชั่วโมง</Text>
            <Text style={styles.columnLabel}>นาที</Text>
          </View>

          <View style={styles.pickerRow}>
            {renderPickerColumn(
              hourOptions,
              selectedHour,
              setSelectedHour,
              hourListRef
            )}

            <View style={styles.centerColonBox}>
              <Text style={styles.centerColon}>:</Text>
            </View>

            {renderPickerColumn(
              minuteOptions,
              selectedMinute,
              setSelectedMinute,
              minuteListRef
            )}
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </Pressable>

            <Pressable style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.confirmText}>ตกลง</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  modalBox: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: COLORS.card || "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border || "#E5E7EB",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.text || "#111827",
    textAlign: "center",
    marginBottom: 14,
  },
  previewBox: {
    alignSelf: "center",
    minWidth: 150,
    height: 64,
    borderRadius: 16,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border || "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  previewText: {
    fontSize: 30,
    fontWeight: "900",
    color: COLORS.primary || "#007AFF",
    minWidth: 46,
    textAlign: "center",
  },
  previewColon: {
    fontSize: 30,
    fontWeight: "900",
    color: COLORS.text || "#111827",
    marginHorizontal: 3,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 48,
    marginBottom: 8,
  },
  columnLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.textMuted || "#6B7280",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  pickerColumn: {
    width: 110,
    height: PICKER_HEIGHT,
    borderRadius: 18,
    backgroundColor: COLORS.cardSoft || "#F3F4F6",
    overflow: "hidden",
    position: "relative",
  },
  pickerColumnContent: {
    paddingVertical: ITEM_HEIGHT,
  },
  selectedFrame: {
    position: "absolute",
    top: ITEM_HEIGHT,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.primary || "#007AFF",
    backgroundColor: "rgba(0, 122, 255, 0.08)",
    zIndex: 1,
  },
  timeItem: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  timeItemText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#9CA3AF",
  },
  timeItemTextActive: {
    color: COLORS.primary || "#007AFF",
  },
  centerColonBox: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  centerColon: {
    fontSize: 30,
    fontWeight: "900",
    color: COLORS.text || "#111827",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: COLORS.cardSoft || "#F3F4F6",
    borderWidth: 1,
    borderColor: COLORS.border || "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text || "#111827",
  },
  confirmButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: COLORS.primary || "#007AFF",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.textLight || "#FFFFFF",
  },
});