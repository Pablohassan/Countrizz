{{- define "countrizz.labels" -}}
app.kubernetes.io/name: countrizz
app.kubernetes.io/component: web
app.kubernetes.io/part-of: countrizz
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}
{{- define "countrizz.selector" -}}
app.kubernetes.io/name: countrizz
app.kubernetes.io/component: web
{{- end -}}
