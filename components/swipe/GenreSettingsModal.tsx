import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GenreSettings } from '../../store/useMovieStore';

const SCORE_RANGE = Array.from({ length: 11 }, (_, i) => i);
const YEAR_RANGE = Array.from({ length: 27 }, (_, i) => 2000 + i);

// Kraje pochodzenia — wielokrotny wybór (bez pozycji "dowolny", brak wyboru = dowolny).
export const COUNTRY_OPTIONS = [
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

// Platformy VOD dostępne w Polsce — identyfikatory dostawców wg TMDB
// (watch/providers, region PL). Lista skrócona do najpopularniejszych;
// jeśli któryś id okaże się nieaktualny, TMDB po prostu nie zwróci wyników
// dla tej platformy — do ewentualnej korekty po przetestowaniu na żywym API.
export const PROVIDER_OPTIONS = [
  { id: 8, label: 'Netflix' },
  { id: 119, label: 'Prime Video' },
  { id: 337, label: 'Disney+' },
  { id: 1899, label: 'Max' },
  { id: 350, label: 'Apple TV+' },
  { id: 1773, label: 'SkyShowtime' },
  { id: 531, label: 'Canal+' },
];

const RESET_SETTINGS: GenreSettings = {
  scoreMin: 1,
  scoreMax: 10,
  yearMin: 2000,
  yearMax: 2026,
  countries: [],
  providers: [],
};

function CustomSelect({
  label,
  value,
  displayValue,
  options,
  onSelect,
  style,
}: {
  label: string;
  value: number | string;
  displayValue: string;
  options: { value: number | string; label: string }[];
  onSelect: (v: any) => void;
  style?: any;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={[{ marginTop: 12 }, style]}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setOpen(true)}>
        <Text style={styles.selectBoxText} numberOfLines={1}>{displayValue}</Text>
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

// Pole wielokrotnego wyboru w formie "chipów" — brak zaznaczonych pozycji = dowolna.
function MultiChipField({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipWrap}>
        {options.map((opt) => {
          const active = selected.includes(opt.key);
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onToggle(opt.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
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

  const toggleCountry = (code: string) =>
    setDraftSettings((s) => ({
      ...s,
      countries: s.countries.includes(code) ? s.countries.filter((c) => c !== code) : [...s.countries, code],
    }));

  const toggleProvider = (idStr: string) => {
    const id = Number(idStr);
    setDraftSettings((s) => ({
      ...s,
      providers: s.providers.includes(id) ? s.providers.filter((p) => p !== id) : [...s.providers, id],
    }));
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
          <View style={styles.titleRow}>
            <Text style={styles.modalTitle}>Filtry</Text>
            <TouchableOpacity style={styles.resetButton} onPress={() => setDraftSettings(RESET_SETTINGS)}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>

          <ScrollView>
            <Text style={styles.sectionLabel}>Ocena użytkowników</Text>
            <View style={styles.rangeRow}>
              <CustomSelect
                label="od"
                value={draftSettings.scoreMin}
                displayValue={String(draftSettings.scoreMin)}
                options={scoreMinOptions}
                onSelect={(v) => setDraftSettings((s) => ({ ...s, scoreMin: v }))}
                style={styles.rangeField}
              />
              <CustomSelect
                label="do"
                value={draftSettings.scoreMax}
                displayValue={String(draftSettings.scoreMax)}
                options={scoreMaxOptions}
                onSelect={(v) => setDraftSettings((s) => ({ ...s, scoreMax: v }))}
                style={styles.rangeField}
              />
            </View>

            <Text style={styles.sectionLabel}>Rok produkcji</Text>
            <View style={styles.rangeRow}>
              <CustomSelect
                label="od"
                value={draftSettings.yearMin}
                displayValue={String(draftSettings.yearMin)}
                options={yearMinOptions}
                onSelect={(v) => setDraftSettings((s) => ({ ...s, yearMin: v }))}
                style={styles.rangeField}
              />
              <CustomSelect
                label="do"
                value={draftSettings.yearMax}
                displayValue={String(draftSettings.yearMax)}
                options={yearMaxOptions}
                onSelect={(v) => setDraftSettings((s) => ({ ...s, yearMax: v }))}
                style={styles.rangeField}
              />
            </View>

            <MultiChipField
              label="Kraj pochodzenia"
              options={COUNTRY_OPTIONS.map((c) => ({ key: c.code, label: c.label }))}
              selected={draftSettings.countries}
              onToggle={toggleCountry}
            />

            <MultiChipField
              label="Dostępne na (VOD)"
              options={PROVIDER_OPTIONS.map((p) => ({ key: String(p.id), label: p.label }))}
              selected={draftSettings.providers.map(String)}
              onToggle={toggleProvider}
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
  modalContent: { backgroundColor: '#141A24', borderRadius: 20, padding: 20, maxHeight: '85%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { color: '#ECEEF2', fontSize: 18, fontWeight: 'bold', flex: 1 },
  resetButton: {
    backgroundColor: '#333',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginLeft: 10,
  },
  resetButtonText: { color: '#ECEEF2', fontSize: 12, fontWeight: 'bold' },
  sectionLabel: { color: '#7C8798', fontSize: 12, fontWeight: 'bold', marginTop: 16, textTransform: 'uppercase' },
  label: { color: '#ECEEF2', fontSize: 14, marginBottom: 4 },

  rangeRow: { flexDirection: 'row' },
  rangeField: { flex: 1, marginRight: 10 },

  selectBox: {
    backgroundColor: '#0B0F17',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#7C8798',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectBoxText: { color: '#ECEEF2', fontSize: 15, flex: 1, marginRight: 6 },
  selectBoxArrow: { color: '#7C8798', fontSize: 14 },

  selectOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 30 },
  selectList: {
    backgroundColor: '#141A24',
    borderRadius: 16,
    maxHeight: '70%',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    overflow: 'hidden',
  },
  selectItem: { paddingVertical: 14, paddingHorizontal: 20 },
  selectItemActive: { backgroundColor: '#333' },
  selectItemText: { color: '#ECEEF2', fontSize: 16 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    backgroundColor: '#0B0F17',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: '#4a7', borderColor: '#4a7' },
  chipText: { color: '#7C8798', fontSize: 13, fontWeight: 'bold' },
  chipTextActive: { color: '#12211A' },

  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  cancelButton: { backgroundColor: '#555', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30 },
  cancelButtonText: { color: '#fff', fontWeight: 'bold' },
  applyButton: { backgroundColor: '#4a7', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30 },
  applyButtonText: { color: '#fff', fontWeight: 'bold' },
});
