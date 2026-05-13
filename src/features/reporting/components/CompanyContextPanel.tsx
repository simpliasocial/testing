import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/useAuth";
import { useDashboardContext } from "@/context/useDashboardContext";
import { canConfigureReportContext } from "@/domain/auth/permissions";

const COMPANY_CONTEXT_PLACEHOLDER = `Ejemplo:
Somos Simplia, una empresa de automatización comercial para negocios que reciben leads por WhatsApp, Meta Ads, Google Ads y formularios web.
Vendemos soluciones de chatbot, CRM conversacional y seguimiento comercial para empresas B2B y B2C en Ecuador y Latinoamérica.
Nuestro cliente ideal es una empresa con alto volumen de leads, equipo comercial interno y necesidad de mejorar conversión, velocidad de respuesta y calidad de seguimiento.
Objetivo comercial principal: aumentar citas calificadas, ventas cerradas y control de rendimiento por canal, campaña y asesor.
Ciclo de ventas aproximado: contacto inicial, calificación, cita o demo, seguimiento, cierre y postventa.`;

export function CompanyContextPanel() {
    const { role } = useAuth();
    const { tagSettings, updateTagSettings } = useDashboardContext();
    const [draft, setDraft] = useState(tagSettings.companyContext || "");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDraft(tagSettings.companyContext || "");
    }, [tagSettings.companyContext]);

    if (!canConfigureReportContext(role)) return null;

    const handleSave = async () => {
        try {
            setSaving(true);
            await updateTagSettings({
                ...tagSettings,
                companyContext: draft.trim(),
            });
            toast.success("Contexto empresarial guardado");
        } catch (error) {
            console.error("Company context save failed:", error);
            toast.error("No se pudo guardar el contexto empresarial");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-primary" />
                    Configurar contexto empresarial
                </CardTitle>
                <CardDescription>
                    Este contexto se agrega al inicio del prompt de los reportes IA para adaptar el análisis al negocio.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="company-report-context">Contexto de la empresa</Label>
                    <Textarea
                        id="company-report-context"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={COMPANY_CONTEXT_PLACEHOLDER}
                        className="min-h-[220px]"
                    />
                    <p className="text-xs text-muted-foreground">
                        Incluye nombre de empresa, industria, mercado, cliente ideal, oferta, canales comerciales, objetivos, equipo y ciclo de ventas.
                    </p>
                </div>
                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={saving || draft.trim() === (tagSettings.companyContext || "").trim()} className="gap-2">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Guardar contexto
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
