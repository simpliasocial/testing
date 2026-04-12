import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";

import { Calendar, Clock, MapPin, Phone, User } from "lucide-react";

export interface Appointment {
    id: number;
    name: string;
    cellphone: string;
    agency: string;
    date: string;
    time: string;
    status: string;
}

interface RecentAppointmentsProps {
    appointments?: Appointment[];
}

export function RecentAppointments({ appointments = [] }: RecentAppointmentsProps) {
    const displayAppointments = appointments.length > 0 ? appointments : [];

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[200px]">Cliente</TableHead>
                        <TableHead>Contacto</TableHead>
                        <TableHead>Agencia</TableHead>
                        <TableHead>Fecha y Hora</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {displayAppointments.map((appointment) => (
                        <TableRow key={appointment.id}>
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    {appointment.name}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    {appointment.cellphone}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    {appointment.agency}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="h-3 w-3 text-muted-foreground" />
                                        {appointment.date}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        {appointment.time}
                                    </div>
                                </div>
                            </TableCell>

                        </TableRow>
                    ))}
                    {displayAppointments.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                No hay citas agendadas recientemente.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
