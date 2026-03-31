import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const nextLang = i18n.language?.startsWith("zh") ? "en" : "zh";
  const label = nextLang === "zh" ? "中文" : "English";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground shrink-0"
      onClick={() => i18n.changeLanguage(nextLang)}
      aria-label={label}
      title={label}
    >
      <Languages className="h-4 w-4" />
    </Button>
  );
}
