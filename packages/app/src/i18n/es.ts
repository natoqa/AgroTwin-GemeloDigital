import type {
  DiagnosisClass,
  LocalDate,
  RainfallAnswer,
  Recommendation,
  Urgency,
  WeakInput,
} from '@agrotwin/domain';

/**
 * Every word the farmer reads, in one file (CLAUDE.md §5: UI in Spanish).
 *
 * The domain speaks in codes and facts — `irrigate_soon`, three days, a date.
 * This file turns them into sentences. Keeping the sentences here, and only
 * here, means the agronomy can be tested without testing prose, and the prose
 * can be reviewed by someone who does not read TypeScript.
 *
 * The register is deliberate: short sentences, second person, no jargon, the
 * action before the reason. "Riega tu parcela" and then why, not the other
 * way round. Words like "evapotranspiración" or "grados-día" appear only where
 * a technician would look for them.
 */

/**
 * Month names as they are written in Peru. "Setiembre", not "septiembre":
 * both are correct Spanish, and this is the one the farmer sees on a
 * calendar in La Libertad.
 */
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** "20 de setiembre de 2026". */
export function formatDate(date: LocalDate): string {
  return `${date.day} de ${MONTHS[date.month - 1] ?? ''} de ${date.year}`;
}

/** "20 de setiembre", for dates that are obviously this season. */
export function formatShortDate(date: LocalDate): string {
  return `${date.day} de ${MONTHS[date.month - 1] ?? ''}`;
}

/** "hoy", "mañana", "en 3 días", "hace 2 días". */
export function relativeDays(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  return days > 0 ? `en ${days} días` : `hace ${-days} días`;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Confidence as words, because a farmer reads "poca certeza" faster than "0.42". */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'alta certeza';
  if (confidence >= 0.6) return 'certeza media';
  return 'poca certeza';
}

export const DIAGNOSIS_LABEL: Record<DiagnosisClass, string> = {
  healthy: 'Planta sana',
  early_blight: 'Posible tizón temprano',
  late_blight: 'Posible tizón tardío',
  rejected: 'No pude identificarlo',
};

export const DIAGNOSIS_HELP: Record<DiagnosisClass, string> = {
  healthy: 'No se ven señales de enfermedad en esta hoja.',
  early_blight: 'La hoja muestra manchas parecidas a las del tizón temprano.',
  late_blight: 'La hoja muestra manchas parecidas a las del tizón tardío.',
  rejected: 'Intenta otra foto, más cerca de la hoja y con buena luz.',
};

export const RAINFALL_LABEL: Record<RainfallAnswer, string> = {
  none: 'No llovió',
  a_little: 'Llovió poco',
  a_lot: 'Llovió mucho',
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  now: 'Hazlo ahora',
  soon: 'Pronto',
  info: 'Para saber',
};

/** Completes "No estoy muy seguro porque…". */
export const WEAK_INPUT_LABEL: Record<WeakInput, string> = {
  synthetic_weather: 'uso un clima de ejemplo, no el de tu zona',
  typical_year_weather: 'uso el clima de un año típico, no el de este año',
  farmer_weather_answers: 'tus respuestas sobre el clima son aproximadas',
  unreviewed_crop_data: 'todavía faltan revisar datos del cultivo',
  projection: 'habla de días que todavía no pasan',
  season_length_only: 'la fecha sale de cuánto dura el cultivo normalmente',
  uncertain_photo: 'la foto no se veía muy clara',
};

export interface RecommendationText {
  readonly title: string;
  readonly why: string;
}

/** The sentence for each piece of advice, action first and then the reason. */
export function recommendationText(recommendation: Recommendation): RecommendationText {
  switch (recommendation.kind) {
    case 'irrigate_now':
      return {
        title: 'Riega tu parcela',
        why: `Al suelo le faltan unos ${Math.round(recommendation.depletion)} mm de agua y la planta ya está pasando sed.`,
      };
    case 'irrigate_soon':
      return {
        title: 'Riega en los próximos días',
        why: `Si no llueve ni riegas, la planta empezaría a pasar sed ${relativeDays(recommendation.daysUntilStress)}, el ${formatShortDate(recommendation.stressStartsOn)}.`,
      };
    case 'water_ok':
      return {
        title: 'El agua alcanza por ahora',
        why: `Al suelo le faltan unos ${Math.round(recommendation.depletion)} mm de agua, pero la planta no pasa sed ni la pasaría en los próximos días.`,
      };
    case 'consider_fungicide':
      return {
        title: 'Revisa tus plantas y considera fungicida',
        why: 'El clima de estos días ha sido favorable para el tizón tardío.',
      };
    case 'check_leaves': {
      const disease = recommendation.diagnosis === 'late_blight' ? 'tizón tardío' : 'tizón temprano';
      const weather = {
        favourable: 'Además, el clima ha sido favorable para la enfermedad.',
        not_favourable:
          'El clima no ha sido muy favorable para la enfermedad: confírmalo mirando más plantas.',
        unknown:
          'No puedo confirmarlo con el clima, porque aquí nadie mide cuánto se moja la hoja.',
      }[recommendation.blightWeather];
      return {
        title: `Revisa otras plantas: posible ${disease}`,
        why: `La foto del ${formatShortDate(recommendation.photographedOn)} se parece a ${disease}. ${weather}`,
      };
    }
    case 'retake_photo':
      return {
        title: 'Toma otra foto',
        why: 'No pude reconocer la última foto. Acércate a la hoja y busca buena luz.',
      };
    case 'take_photo':
      return {
        title: 'Toma una foto de una hoja',
        why:
          recommendation.daysSinceLastPhoto === undefined
            ? 'Todavía no hay fotos de esta campaña. Con una foto, el gemelo sabe cómo están tus plantas.'
            : `Tu última foto es de hace ${recommendation.daysSinceLastPhoto} días. Con una nueva, el gemelo sabe cómo están hoy.`,
      };
    case 'report_weather':
      return {
        title: 'Cuéntame cómo estuvo el clima ayer',
        why: 'Son dos preguntas. Con tus respuestas, el gemelo se parece más a tu parcela.',
      };
    case 'harvest_near': {
      const when =
        recommendation.daysFromToday >= 0
          ? `Fecha aproximada: ${formatShortDate(recommendation.date)}, ${relativeDays(recommendation.daysFromToday)}.`
          : `La fecha aproximada ya pasó: era el ${formatShortDate(recommendation.date)}.`;
      const how =
        recommendation.method === 'thermal_time'
          ? 'La calculo con el calor que ha recibido la planta.'
          : 'La calculo con lo que dura normalmente el cultivo, no con el clima de este año.';
      return { title: 'Se acerca la cosecha', why: `${when} ${how}` };
    }
    case 'add_location':
      return {
        title: 'Pon la ubicación de tu parcela',
        why: 'Sin saber dónde queda, no puedo calcular el agua de tu parcela.',
      };
    case 'crop_data_missing':
      return {
        title: 'Faltan datos del cultivo',
        why: 'El equipo técnico tiene que completar datos de la papa para esta zona. No es algo que tengas que hacer tú.',
      };
  }
}

/** "No estoy muy seguro porque uso un clima de ejemplo y todavía faltan…". */
export function weakInputsSentence(inputs: readonly WeakInput[]): string {
  const parts = inputs.map((input) => WEAK_INPUT_LABEL[input]);
  if (parts.length === 0) return '';
  const joined =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  return `No estoy muy seguro porque ${joined}.`;
}

export const es = {
  app: {
    loading: 'Cargando…',
    startupError:
      'No se pudo abrir el almacenamiento de este teléfono. Cierra la aplicación y vuelve a abrirla.',
  },
  common: {
    back: 'Volver',
    save: 'Guardar',
    saveFailed: 'No se pudo guardar. Intenta de nuevo.',
    myPlots: 'Mis parcelas',
    certainty: (confidence: number) => `Qué tan seguro estoy: ${confidenceLabel(confidence)}`,
  },
  storage: {
    persisted: 'Tus datos están guardados en este teléfono y no se borrarán solos.',
    notPersisted:
      'Este teléfono podría borrar tus datos si se queda sin espacio. Guarda una copia de vez en cuando.',
    goBackup: 'Guardar una copia',
  },
  plots: {
    title: 'Mis parcelas',
    nameLabel: 'Nombre de la parcela',
    create: 'Crear parcela',
    empty: 'Todavía no tienes parcelas. Crea la primera.',
    nameError: 'Escribe un nombre para la parcela.',
    backupTitle: 'Copia de seguridad',
    backupButton: 'Copia de seguridad',
  },
  plot: {
    campaigns: 'Campañas de esta parcela',
    detailsTitle: 'Datos de la parcela',
    detailsHelp:
      'La ubicación sirve para calcular el agua de tu parcela. Si no la sabes, déjala en blanco y llénala después.',
    name: 'Nombre',
    area: 'Tamaño en hectáreas',
    latitude: 'Latitud',
    longitude: 'Longitud',
    altitude: 'Altura sobre el mar, en metros',
    save: 'Guardar datos',
    saved: 'Datos guardados.',
    errors: {
      INVALID_PLOT_NAME: 'Escribe un nombre para la parcela.',
      INVALID_AREA: 'El tamaño debe ser un número mayor que cero.',
      INVALID_COORDINATES: 'Revisa la latitud, la longitud y la altura.',
    } as Record<string, string>,
  },
  campaigns: {
    title: (plot: string) => `Campañas de ${plot}`,
    back: 'Volver a la parcela',
    startTitle: 'Empezar una campaña',
    plantingLabel: '¿Qué día sembraste?',
    start: 'Empezar campaña',
    listTitle: 'Campañas',
    item: (date: LocalDate, closed: boolean) =>
      `Siembra del ${formatDate(date)} ${closed ? '(cosechada)' : '(en curso)'}`,
    empty: 'Esta parcela no tiene campañas. Empieza una con la fecha en que sembraste.',
    startFailed: 'No se pudo empezar la campaña.',
    errors: {
      ACTIVE_CAMPAIGN_ALREADY_EXISTS:
        'Esta parcela ya tiene una campaña en curso. Ciérrala antes de empezar otra.',
      INVALID_CAMPAIGN_DATES: 'Revisa la fecha de siembra.',
      INVALID_LOCAL_DATE: 'Elige el día en que sembraste.',
    } as Record<string, string>,
  },
  capture: {
    title: (plot: string) => `Foto de ${plot}`,
    help: 'Toma una foto de una hoja, de cerca y con buena luz.',
    noteLabel: '¿Quieres apuntar algo? (opcional)',
    photoLabel: 'Foto de la hoja',
    analysing: 'Analizando…',
    failed: 'No se pudo guardar la foto. Intenta de nuevo.',
  },
  weather: {
    title: (plot: string) => `El clima de ayer en ${plot}`,
    help: 'Dos preguntas. Con esto el gemelo entiende mejor tu parcela.',
    rainQuestion: '¿Llovió ayer?',
    coldQuestion: '¿Hizo frío en la noche?',
    coldYes: 'Sí, hizo frío',
    coldNo: 'No, normal',
    saved: 'Gracias. Guardado.',
  },
  backup: {
    title: 'Copia de seguridad',
    intro:
      'Tus datos viven solo en este teléfono. Guarda una copia y pásala a una computadora o a una memoria para no perderla.',
    saveTitle: 'Guardar una copia',
    saveHelp:
      'La copia guarda tus parcelas, campañas, fotos pequeñas, riegos y respuestas del clima.',
    saveButton: 'Guardar copia',
    saved: 'Copia guardada en tus descargas.',
    saveFailed: 'No se pudo guardar la copia.',
    restoreTitle: 'Restaurar una copia',
    restoreLabel: 'Elige el archivo de la copia',
    restored: (plots: number, campaigns: number, observations: number) =>
      `Copia restaurada: ${plots} parcelas, ${campaigns} campañas y ${observations} observaciones.`,
    notABackup: 'Ese archivo no es una copia que esta aplicación pueda leer.',
    restoreFailed: 'No se pudo restaurar la copia.',
    eraseTitle: 'Borrar todo',
    eraseHelp: (word: string) =>
      `Esto borra todo lo que hay en este teléfono y no se puede deshacer. Escribe ${word} para confirmar.`,
    eraseLabel: (word: string) => `Escribe ${word}`,
    eraseButton: 'Borrar todo',
    erased: 'Se borraron todos los datos de este teléfono.',
    eraseFailed: 'No se pudieron borrar los datos.',
  },
  twin: {
    back: 'Volver a las campañas',
    heading: (planting: LocalDate, closedOn: LocalDate | undefined) =>
      closedOn === undefined
        ? `Siembra del ${formatDate(planting)}`
        : `Siembra del ${formatDate(planting)} — cosechada el ${formatDate(closedOn)}`,
    dayOfCampaign: (day: number) => `Día ${day} de la campaña`,
    synthetic:
      'Estos cálculos usan un clima de ejemplo, no el clima real de tu zona. Sirven para probar la aplicación, no para decidir en tu parcela.',
    syntheticLead: 'Atención:',
    todoTitle: 'Qué hacer',
    nothingToDo: 'Por ahora no tengo nada que recomendarte.',
    harvestedNothing: 'Esta campaña ya se cosechó. Aquí queda su historia.',
    demoted: 'La puse más abajo porque no estoy seguro.',
    actionsTitle: 'Cuéntale al gemelo',
    takePhoto: 'Tomar foto',
    irrigated: 'Regué hoy',
    irrigatedSaved: 'Anotado: regaste hoy.',
    irrigatedFailed: 'No se pudo anotar el riego. Intenta de nuevo.',
    weather: 'Contar el clima de ayer',
    close: 'Ya coseché',
    stateTitle: 'Cómo va el cultivo',
    latestPhotoTitle: (date: LocalDate) => `Última foto: ${formatShortDate(date)}`,
    photoProvenance: 'Basado en la foto que tomaste.',
    yourNote: (note: string) => `Tu nota: ${note}`,
    noSnapshots: 'Aún no hay fotos de esta campaña.',
    historyTitle: 'Historial',
    historyEmpty: 'Todavía no hay nada en el historial de esta campaña.',
    history: {
      photo: (label: string, confidence: number, purged: boolean) =>
        `Foto: ${label} (${confidenceLabel(confidence)})${purged ? ' — foto ya no guardada' : ''}`,
      irrigation: 'Regaste',
      weather: (rainfall: RainfallAnswer, coldNight: boolean) =>
        `Clima: ${RAINFALL_LABEL[rainfall].toLowerCase()}${coldNight ? ', noche fría' : ''}`,
      day: (day: number, date: LocalDate) => `Día ${day} · ${formatShortDate(date)}`,
    },
  },
  agronomy: {
    noLocation:
      'Para calcular el agua de tu parcela necesito saber dónde queda. Puedes ponerlo en los datos de la parcela.',
    noWeather: 'Todavía no tengo el clima de esta campaña.',
    unavailable:
      'Todavía no puedo calcular el estado del cultivo. Faltan datos del cultivo que el equipo técnico debe revisar.',
    waterTitle: 'Agua en el suelo',
    waterThirsty: (mm: number) =>
      `A tu parcela le faltan unos ${mm} mm de agua. La planta ya está pasando sed.`,
    waterOk: (mm: number) => `A tu parcela le faltan unos ${mm} mm de agua. Todavía alcanza.`,
    heatTitle: 'Calor acumulado',
    heat: (gdd: number) => `Calor acumulado desde la siembra: ${gdd} grados-día`,
    stageTitle: 'Etapa de la planta',
    stage: (label: string) => `La planta está ${label}`,
    stageUnknown:
      'Todavía no puedo decirte en qué etapa está la planta: falta información del cultivo para esta zona.',
    stageLabel: {
      emergence: 'brotando',
      vegetative_development: 'creciendo',
      tuber_initiation: 'empezando a formar papas',
      bulking: 'engordando las papas',
      maturity: 'lista para cosechar',
    } as Record<string, string>,
    blightTitle: 'Tizón tardío',
    blightFavourable:
      'El clima ha estado favorable para el tizón tardío. Conviene revisar y considerar fungicida.',
    blightCalm: 'Por ahora el clima no ha sido muy favorable para el tizón tardío.',
    blightUnknown: 'No puedo calcular el riesgo de tizón: nadie mide cuántas horas se moja la hoja.',
  },
  scenarios: {
    title: '¿Y si…?',
    pick: 'Elige una pregunta',
    help: 'Pregúntale al gemelo qué pasaría. Nada de esto cambia tu parcela: son cálculos.',
    noIrrigation: '¿Y si no riego?',
    daysChoice: (days: number) => `${days} ${plural(days, 'día', 'días')}`,
    daysLegend: '¿Cuántos días sin regar?',
    fungicide: '¿Y si aplico fungicida hoy?',
    harvest: '¿Cuándo cosecho?',
    ask: 'Calcular',
    projectionNote:
      'Es un cálculo hacia adelante con el clima de un año típico. Puede cambiar si el clima es distinto.',
    water: {
      stressedToday: (days: number, mm: number) =>
        `La planta ya está pasando sed. Si no riegas en ${days} ${plural(days, 'día', 'días')}, al suelo le faltarían unos ${mm} mm de agua.`,
      stressComing: (daysUntil: number, date: LocalDate) =>
        `Si no riegas, la planta empezaría a pasar sed ${relativeDays(daysUntil)}, el ${formatShortDate(date)}.`,
      noStress: (days: number, mm: number) =>
        `En ${days} ${plural(days, 'día', 'días')} sin regar, la planta no llegaría a pasar sed. Al suelo le faltarían unos ${mm} mm de agua.`,
      wateredDelays: (date: LocalDate) =>
        `Si riegas hoy, la sed llegaría recién el ${formatShortDate(date)}.`,
      wateredAvoids: (days: number) =>
        `Si riegas hoy, no pasaría sed en esos ${days} ${plural(days, 'día', 'días')}.`,
    },
    fungicideResult: {
      protectedThrough: (date: LocalDate) =>
        `La aplicación protegería a tus plantas hasta el ${formatShortDate(date)}.`,
      without: (days: number | undefined) =>
        days === undefined
          ? 'Sin fungicida, el clima no llegaría a pedir una aplicación en las próximas semanas.'
          : days === 0
            ? 'Sin fungicida, el clima ya pide una aplicación.'
            : `Sin fungicida, el clima pediría una aplicación ${relativeDays(days)}.`,
      with: (days: number | undefined) =>
        days === undefined
          ? 'Con fungicida hoy, no haría falta otra aplicación en las próximas semanas.'
          : `Con fungicida hoy, la siguiente haría falta ${relativeDays(days)}.`,
    },
    harvestResult: {
      date: (date: LocalDate, days: number) =>
        days >= 0
          ? `Fecha aproximada de cosecha: ${formatDate(date)}, ${relativeDays(days)}.`
          : `La fecha aproximada de cosecha ya pasó: era el ${formatDate(date)}.`,
      thermal: 'La calculo con el calor que ha recibido y recibiría la planta.',
      stageLengths:
        'La calculo con lo que dura normalmente el cultivo, no con el clima de este año. Tómala como una idea, no como una fecha fija.',
      notReached: 'Con el clima de un año típico, no llego a ver cuándo madura la planta.',
    },
    unavailable: {
      no_location:
        'Para calcular esto necesito saber dónde queda tu parcela. Ponlo en los datos de la parcela.',
      campaign_closed: 'Esta campaña ya se cosechó: no hay nada que calcular hacia adelante.',
      no_weather: 'Todavía no tengo el clima de esta campaña.',
      missing_coefficients:
        'No puedo calcularlo: faltan datos del cultivo que el equipo técnico debe completar.',
      no_leaf_wetness:
        'No puedo calcularlo: aquí nadie mide cuántas horas se moja la hoja, y sin eso no sé cómo va el tizón.',
      fungicide_protection:
        'No puedo calcularlo: falta saber cuántos días protege el fungicida, y eso depende del producto.',
    },
  },
} as const;
