import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GenreSettings } from '../../store/useMovieStore';

const SCORE_RANGE = Array.from({ length: 11 }, (_, i) => i);
const YEAR_RANGE = Array.from({ length: 27 }, (_, i) => 2000 + i);
const COUNTRY_OPTIONS = [
  { code: '', label: 'Dowolny kraj' },
  { code: 'US', label: 'USA' },
  { code: 'IN', label: 'Indie' },
  { code: 'CN', label: 'Chiny' },
  { code: 'JP', label: 'Japonia' },
  { code: 'GB', label: 'Wielka Brytania' },
  { code: 'KR', label: 'Korea Południowa' },
  { code: 'FR', label: 'Francja' },
  { code: 'ES', label: 'Hiszpania' },
  { code: 'DE', label: 'Niemcy' },
  { code: 'IT', label: 'Włochy' },
  { code: 'PL', label: 'Polska' },
];

export { COUNTRY_OPTIONS };

const RESET_SETTINGS: GenreSettings = {
  scoreMin: 1,
  scoreMax: 10,
  yearMin: 2000,
  yearMax: 2026,
  country: '',
};

function CustomSelect({
  label,
  value,
  displayValue,
  options,
  onSelect,
}: {
  label: string;
  value: number | string;
  displayValue: string;
  options: { value: number | string; label: string }[];
  onSelect: (v: any) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setOpen(true)}>
        <Text style={styles.selectBoxText}>{displayValue}</Text>
        <Text style={styles.selectBoxArrow}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={styles.selectOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.selectList}>
            <ScrollView>
              {options.map((opt) => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[styles.selectItem, opt.value === value && styles.selectItemActive]}
                  onPress={() => {
                    onSelect(opt.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.selectItemText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

interface GenreSettingsModalProps {
  visible: boolean;
  genreName: string;
  draftSettings: GenreSettings;
  setDraftSettings: React.Dispatch<React.SetStateAction<GenreSettings>>;
  onCancel: () => void;
  onApply: () => void;
}

export function GenreSettingsModal({
  visible,
  genreName,
  draftSettings,
  setDraftSettings,
  onCancel,
  onApply,
}: GenreSettingsModalProps) {
  const scoreMinOptions = SCORE_RANGE.filter((v) => v <= draftSettings.scoreMax).map((v) => ({ value: v, label: String(v) }));
  const scoreMaxOptions = SCORE_RANGE.filter((v) => v >= draftSettings.scoreMin).map((v) => ({ value: v, label: String(v) }));
  const yearMinOptions = YEAR_RANGE.filter((v) => v <= draftSettings.yearMax).map((v) => ({ value: v, label: String(v) }));
  const yearMaxOptions = YEAR_RANGE.filter((v) => v >= draftSettings.yearMin).map((v) => ({ value: v, label: String(v) }));
  const countryOptions = COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: c.label }));
  const countryLabel = COUNTRY_OPTIONS.find((c) => c.code === draftSettings.country)?.label ?? 'Dowolny kraj';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
          <View style={styles.titleRow}>
            <Text style={styles.modalTitle}>Ustawienia — {genreName}</Text>
            <TouchableOpacity style={styles.resetButton} onPress={() => setDraftSettings(RESET_SETTINGS)}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>

          <ScrollView>
            <CustomSelect
              label="Ocena użytkowników — od"
              value={draftSettings.scoreMin}
              displayValue={String(draftSettings.scoreMin)}
              options={scoreMinOptions}
              onSelect={(v) => setDraftSettings((s) => ({ ...s, scoreMin: v }))}
            />

            <CustomSelect
              label="Ocena użytkowników — do"
              value={draftSettings.scoreMax}
              displayValue={String(draftSettings.scoreMax)}
              options={scoreMaxOptions}
              onSelect={(v) => setDraftSettings((s) => ({ ...s, scoreMax: v }))}
            />

            <CustomSelect
              label="Rok produkcji — od"
              value={draftSettings.yearMin}
              displayValue={String(draftSettings.yearMin)}
              options={yearMinOptions}
              onSelect={(v) => setDraftSettings((s) => ({ ...s, yearMin: v }))}
            />

            <CustomSelect
              label="Rok produkcji — do"
              value={draftSettings.yearMax}
              displayValue={String(draftSettings.yearMax)}
              options={yearMaxOptions}
              onSelect={(v) => setDraftSettings((s) => ({ ...s, yearMax: v }))}
            />

            <CustomSelect
              label="Kraj produkcji"
              value={draftSettings.country}
              displayValue={countryLabel}
              options={countryOptions}
              onSelect={(v) => setDraftSettings((s) => ({ ...s, country: v }))}
            />
          </ScrollView>

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Anuluj</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={onApply}>
              <Text style={styles.applyButtonText}>Zastosuj</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E1D18', borderRadius: 20, padding: 20, maxHeight: '85%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { color: '#E8E4D9', fontSize: 18, fontWeight: 'bold', flex: 1 },
  resetButton: {
    backgroundColor: '#333',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginLeft: 10,
  },
  resetButtonText: { color: '#E8E4D9', fontSize: 12, fontWeight: 'bold' },
  label: { color: '#E8E4D9', fontSize: 14, marginBottom: 4 },

  selectBox: {
    backgroundColor: '#26251F',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectBoxText: { color: '#E8E4D9', fontSize: 15 },
  selectBoxArrow: { color: '#B5AFA0', fontSize: 14 },

  selectOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 30 },
  selectList: {
    backgroundColor: '#1E1D18',
    borderRadius: 16,
    maxHeight: '70%',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    overflow: 'hidden',
  },
  selectItem: { paddingVertical: 14, paddingHorizontal: 20 },
  selectItemActive: { backgroundColor: '#333' },
  selectItemText: { color: '#E8E4D9', fontSize: 16 },

  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  cancelButton: { backgroundColor: '#555', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30 },
  cancelButtonText: { color: '#fff', fontWeight: 'bold' },
  applyButton: { backgroundColor: '#4a7', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30 },
  applyButtonText: { color: '#fff', fontWeight: 'bold' },
});
