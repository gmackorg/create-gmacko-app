import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import type { Locale } from "@gmacko/i18n/native";
import {
  supportedLocales,
  useLocaleNative,
  useTranslationsNative,
} from "@gmacko/i18n/native";

import { setLocale } from "~/utils/i18n";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  es: "Espanol",
  fr: "Francais",
  de: "Deutsch",
  ja: "Japanese",
  zh: "Chinese",
};

interface LocaleSwitcherProps {
  onLocaleChange?: (locale: string) => void;
}

export function LocaleSwitcher({ onLocaleChange }: LocaleSwitcherProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const currentLocale = useLocaleNative();
  const t = useTranslationsNative();

  const handleLocaleChange = async (locale: Locale) => {
    await setLocale(locale);
    onLocaleChange?.(locale);
    setModalVisible(false);
  };

  return (
    <View>
      <Pressable
        onPress={() => setModalVisible(true)}
        className="border-border bg-background flex-row items-center justify-between rounded-lg border px-4 py-3"
      >
        <Text className="text-foreground">{t("common.selectLanguage")}</Text>
        <Text className="text-muted-foreground">
          {LOCALE_LABELS[currentLocale] ?? currentLocale.toUpperCase()}
        </Text>
      </Pressable>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/50"
          onPress={() => setModalVisible(false)}
        >
          <View className="bg-background rounded-t-3xl p-4">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-foreground text-xl font-semibold">
                {t("common.selectLanguage")}
              </Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Text className="text-primary">{t("common.close")}</Text>
              </Pressable>
            </View>

            <View className="gap-1">
              {supportedLocales.map((locale) => (
                <Pressable
                  key={locale}
                  onPress={() => void handleLocaleChange(locale)}
                  className={`flex-row items-center justify-between rounded-lg px-4 py-3 ${
                    currentLocale === locale ? "bg-primary/10" : ""
                  }`}
                >
                  <Text
                    className={`text-base ${
                      currentLocale === locale
                        ? "text-primary font-semibold"
                        : "text-foreground"
                    }`}
                  >
                    {LOCALE_LABELS[locale] ?? locale.toUpperCase()}
                  </Text>
                  {currentLocale === locale && (
                    <Text className="text-primary">✓</Text>
                  )}
                </Pressable>
              ))}
            </View>

            <View className="mt-4 h-8" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function LocaleButtonGroup({ onLocaleChange }: LocaleSwitcherProps) {
  const currentLocale = useLocaleNative();

  const handleLocaleChange = async (locale: Locale) => {
    await setLocale(locale);
    onLocaleChange?.(locale);
  };

  return (
    <View className="flex-row flex-wrap gap-2">
      {supportedLocales.map((locale) => (
        <Pressable
          key={locale}
          onPress={() => void handleLocaleChange(locale)}
          className={`rounded-md px-4 py-2 ${
            currentLocale === locale
              ? "bg-primary"
              : "border-border bg-background border"
          }`}
        >
          <Text
            className={
              currentLocale === locale
                ? "text-primary-foreground"
                : "text-foreground"
            }
          >
            {locale.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
