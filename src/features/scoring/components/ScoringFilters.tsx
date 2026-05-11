import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge } from "lucide-react";
import { formatBusinessLabel } from "@/lib/displayCopy";
import { SCORE_BUCKET_COPY, SCORE_BUCKET_ORDER, type ScoreBucket } from "@/lib/leadScoreClassification";
import { FilterSelect, MultiFilterSelect } from "./ScoringShared";

interface ScoringFiltersProps {
    campaignFilter: string;
    setCampaignFilter: (value: string) => void;
    labelFilters: string[];
    setLabelFilters: (values: string[]) => void;
    ownerFilter: string;
    setOwnerFilter: (value: string) => void;
    bucketFilter: string;
    setBucketFilter: (value: string) => void;
    filterOptions: {
        campaigns: string[];
        labels: string[];
        owners: string[];
    };
}

const BUCKET_ORDER = SCORE_BUCKET_ORDER;
const BUCKET_COPY = SCORE_BUCKET_COPY;

export const ScoringFilters: React.FC<ScoringFiltersProps> = ({
    campaignFilter, setCampaignFilter,
    labelFilters, setLabelFilters,
    ownerFilter, setOwnerFilter,
    bucketFilter, setBucketFilter,
    filterOptions,
}) => {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Gauge className="h-5 w-5 text-primary" />
                    Filtros de calidad
                </CardTitle>
                <CardDescription>
                    Fecha y canal se controlan arriba. Aquí refinamos campaña, estado, responsable y nivel.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <FilterSelect label="Campaña" value={campaignFilter} onChange={setCampaignFilter} options={filterOptions.campaigns} />
                    <MultiFilterSelect label="Estado" values={labelFilters} onChange={setLabelFilters} options={filterOptions.labels} optionLabel={formatBusinessLabel} />
                    <FilterSelect label="Responsable" value={ownerFilter} onChange={setOwnerFilter} options={filterOptions.owners} />
                    <FilterSelect
                        label="Nivel"
                        value={bucketFilter}
                        onChange={setBucketFilter}
                        options={BUCKET_ORDER}
                        optionLabel={(value) => BUCKET_COPY[value as ScoreBucket]?.label || value}
                    />
                </div>
            </CardContent>
        </Card>
    );
};
