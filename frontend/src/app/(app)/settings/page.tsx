"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, KeyRound, Moon, Palette, ShieldAlert, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Segmented } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { setUser } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState("");

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    try {
      await api("/users/me/password", { method: "POST", body: { current_password: pw.current, new_password: pw.next } });
      setPw({ current: "", next: "" });
      toast("Password updated.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setPwBusy(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api<unknown>("/users/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skillverse-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm("Permanently delete your account and all your data? This cannot be undone.")) return;
    setDelBusy(true);
    setDelError("");
    try {
      await api("/users/me", { method: "DELETE", body: { password: delPw } });
      setUser(null);
      router.replace("/");
    } catch (err) {
      setDelError(errorMessage(err));
      setDelBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Settings</h1>
        <p className="mt-1 text-fg-muted">Appearance, security and your data.</p>
      </div>

      <Card>
        <CardHeader title="Appearance" icon={<Palette className="h-4 w-4" />} />
        <CardBody>
          <Segmented<"light" | "dark">
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "☀️ Light" },
              { value: "dark", label: "🌙 Dark" },
            ]}
          />
          <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
            {theme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            Saved on this device. Animations follow your system&apos;s reduced-motion setting.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Change password" icon={<KeyRound className="h-4 w-4" />} />
        <CardBody>
          <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
            <Field label="Current password" htmlFor="cur">
              <Input id="cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
            </Field>
            <Field label="New password" htmlFor="new" hint="8+ characters, letters and numbers or symbols.">
              <Input id="new" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={pwBusy} disabled={!pw.current || pw.next.length < 8}>
                Update password
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your data" description="Download everything SkillVerse stores about you as JSON." icon={<Download className="h-4 w-4" />} />
        <CardBody>
          <Button variant="outline" onClick={exportData} loading={exporting}>
            <Download className="h-4 w-4" /> Export my data
          </Button>
        </CardBody>
      </Card>

      <Card className="border-danger/30">
        <CardHeader
          title="Delete account"
          description="Removes your profile, resumes, interviews, transcripts, reports and activity permanently."
          icon={<ShieldAlert className="h-4 w-4 text-danger" />}
        />
        <CardBody>
          <form onSubmit={deleteAccount} className="space-y-4">
            <Field label="Confirm with your password" htmlFor="delpw">
              <Input id="delpw" type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} required />
            </Field>
            {delError && <ErrorState message={delError} />}
            <Button type="submit" variant="danger" loading={delBusy} disabled={!delPw}>
              Delete my account
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
