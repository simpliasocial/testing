const normalizeCopyKey = (value: unknown) =>
    String(value ?? "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[\s-]+/g, "_");

const titleCase = (value: string) =>
    value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

const BUSINESS_LABELS: Record<string, string> = {
    venta_exitosa: "Venta exitosa",
    venta: "Venta",
    cita_agendada: "Cita agendada",
    cita_agendada_humano: "Cita agendada",
    cita: "Cita",
    seguimiento_humano: "Seguimiento humano",
    interesado: "Interesado",
    crear_confianza: "Crear confianza",
    crear_urgencia: "Crear urgencia",
    desinteresado: "Desinteresado",
    no_aplica: "No aplica",
    sql: "Lead calificado",
    score: "Puntaje",
    lead_score: "Puntaje del lead",
    score_interes: "Puntaje de interés",
    monto_operacion: "Monto de la operación",
    fecha_monto_operacion: "Fecha en que se registró el monto",
    fecha_visita: "Fecha de visita",
    hora_visita: "Hora de visita",
    nombre_completo: "Nombre completo",
    telefono: "Teléfono",
    celular: "Teléfono",
    correo: "Correo",
    campana: "Campaña",
    utm_campaign: "Campaña",
    checkincat: "Check-in",
    checkoutcat: "Check-out",
    responsable: "Responsable",
    agente: "Agente",
    attr: "Campo",
    custom_attributes: "Campos personalizados",
    contact_attributes: "Campos del cliente",
    contact_custom_attributes: "Campos del cliente",
    conversation_custom_attributes: "Campos de la conversación",
};

const FIELD_LABELS: Record<string, string> = {
    ...BUSINESS_LABELS,
    estado: "Estado",
    estados: "Estados",
    etiquetas: "Estados",
    etiqueta: "Estado",
    monto: "Monto de la operación",
    fecha_monto: "Fecha en que se registró el monto",
    enlace_chatwoot: "Enlace de conversación",
    agente_chatwoot: "Agente asignado",
    origen_dato: "Origen del dato",
    id_inbox: "ID de bandeja",
    id_cuenta: "ID de cuenta",
    id_contacto: "ID del contacto",
    ultima_interaccion: "Última interacción",
    ultimo_mensaje: "Último mensaje",
    fecha_ingreso: "Fecha de ingreso",
    monto_numerico: "Monto numérico",
    telefono_celular: "Teléfono",
    nombre_del_lead: "Nombre del lead",
    id_conversacion: "ID de conversación",
    url_red_social: "URL comercial",
};

export const formatBusinessLabel = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    const key = normalizeCopyKey(raw);
    return BUSINESS_LABELS[key] || FIELD_LABELS[key] || titleCase(raw);
};

export const formatFieldLabel = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    const key = normalizeCopyKey(raw);
    return FIELD_LABELS[key] || BUSINESS_LABELS[key] || titleCase(raw);
};

export const formatBusinessList = (values: unknown[] = [], separator = ", ") =>
    values.map(formatBusinessLabel).filter(Boolean).join(separator);

export const friendlyErrorMessage = (
    context: "loadFields" | "saveAppointment" | "saveSale" | "changeStatus" | "export" | "generic" = "generic",
) => {
    const messages: Record<typeof context, string> = {
        loadFields: "No se pudieron cargar los campos necesarios. Intenta nuevamente.",
        saveAppointment: "No se pudo guardar la cita. Intenta nuevamente.",
        saveSale: "No se pudo guardar la venta. Intenta nuevamente.",
        changeStatus: "No se pudo cambiar el estado. Intenta nuevamente.",
        export: "No se pudo generar el reporte. Intenta nuevamente.",
        generic: "Ocurrió un problema. Intenta nuevamente.",
    };

    return messages[context];
};
