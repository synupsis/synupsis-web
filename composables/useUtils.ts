import type { Ref } from 'vue';

export default function useUtils() {
  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  const pluralize = (text: string, val: number): string => {
    if (val <= 1) {
      return text;
    }

    // NOTE VL : from https://github.com/swestrich/pluralize-fr/blob/master/index.js
    const strings = text.split(' ');
    const plurals = [];
    let radical;
    let pluriel;
    for (const i in strings) {
      const str = strings[i];
      // http://grammaire.reverso.net/5_5_01_pluriel_des_noms_et_des_adjectifs.shtml

      // If pluriel is not initialized
      if (!pluriel) {
        pluriel = '';
      }

      const lastLetter = str[str.length - 1], // Last letter of str
        last2Letters = str.slice(-2), // Last 3 letters of str
        last3Letters = str.slice(-3);
      // exception for /s/z/x
      if (lastLetter === 's' || lastLetter === 'z' || lastLetter === 'x') {
        pluriel = str;
      }
      // Exception for /eau/au/eu
      else if (last2Letters === 'au' || last2Letters === 'eu') {
        //Les mots de la liste suivante font exception à cette règle et prennent un s au pluriel : bleu, émeu, landau, lieu « poisson », pneu, sarrau
        switch (str) {
          case 'bleu':
          case 'émeu':
          case 'landau':
          case 'pneu':
          case 'sarrau':
            pluriel = str + 's';
            break;
          default:
            pluriel = str + 'x';
        }
      } else if (last2Letters === 'ou') {
        switch (str) {
          case 'bijou':
          case 'chou':
          case 'genou':
          case 'caillou':
          case 'hibou':
          case 'joujou':
          case 'pou':
          case 'ripou':
          case 'chouchou':
          case 'boutchou':
            pluriel = str + 'x';
            break;
          default:
            pluriel = str + 's';
        }
      } else if (last3Letters === 'ail') {
        switch (str) {
          case 'bail':
          case 'corail':
          case 'émail':
          case 'gemmail':
          case 'soupirail':
          case 'travail':
          case 'vantail':
          case 'vitrail':
            radical = str.substring(0, str.length - 3);
            pluriel = radical + 'aux';
            break;
          case 'ail':
            pluriel = 'aulx';
            break;
          default:
            pluriel = str + 's';
        }
      } else if (last2Letters === 'al') {
        switch (str) {
          case 'aval':
          case 'bal':
          case 'banal':
          case 'bancal':
          case 'cal':
          case 'carnaval':
          case 'cérémonial':
          case 'choral':
          case 'étal':
          case 'fatal':
          case 'festival':
          case 'natal':
          case 'naval':
          case 'pal':
          case 'récital':
          case 'régal':
          case 'tonal':
          case 'val':
          case 'virginal':
            pluriel = str + 's';
            break;
          default:
            radical = str.substring(0, str.length - 2);
            pluriel = radical + 'aux';
        }
      } else if (last2Letters === 'il' && (str === 'oeil' || str === 'œil')) {
        pluriel = 'yeux';
      } else {
        pluriel = str + 's';
      }
      plurals.push(pluriel);
    }
    pluriel = plurals.join(' ');
    return pluriel;
  };

  const sortBy = <T extends Record<string, unknown>>(key: keyof T) => (a: T, b: T) =>
    a[key] > b[key] ? 1 : b[key] > a[key] ? -1 : 0;

  const groupBy = <T extends Record<string, unknown>>(array: T[], key: keyof T) =>
    (array || []).reduce((r, v) => {
      const k = v[key] as string;
      (r[k] || (r[k] = [])).push(v);
      return r;
    }, {} as Record<string, T[]>);

  const keyBy = <T extends Record<string, unknown>>(array: T[], key: keyof T) =>
    (array || []).reduce((r, x) => ({ ...r, [x[key] as string]: x }), {} as Record<string, T>);

  const debounce = <T extends (...args: unknown[]) => unknown>(
    callback: T,
    ms = 300
  ): ((...args: Parameters<T>) => Promise<ReturnType<T>>) => {
    let timer: number;

    return (...args: Parameters<T>) => {
      if (timer) {
        clearTimeout(timer);
      }
      return new Promise<ReturnType<T>>(resolve => {
        timer = setTimeout(() => {
          const returnValue = callback(...args) as ReturnType<T>;
          resolve(returnValue);
        }, ms);
      });
    };
  };

  const flattenObject = (
    object: Record<string, unknown>,
    parents: Array<string> = []
  ): Record<string, unknown> => {
    return Object.assign(
      {},
      ...Object.entries(object).map(([k, v]) =>
        v && typeof v === 'object'
          ? flattenObject(v as Record<string, unknown>, [...parents, k])
          : { [[...parents, k].join('.')]: v }
      )
    );
  };

  const unflattenObject = (obj: Record<string, unknown>) =>
    Object.keys(obj).reduce((res, k) => {
      k.split('.').reduce(
        (acc: Record<string, unknown>, e, i, keys) =>
          acc[e] ||
          (acc[e] = isNaN(Number(keys[i + 1])) ? (keys.length - 1 === i ? obj[k] : {}) : []),
        res
      );
      return res;
    }, {} as Record<string, unknown>);

  const equals = (a: Array<unknown>, b: Array<unknown>) => {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  };

  const setInitialFormValues = (
    formData: Ref<Record<string, unknown>>,
    formSchema: Ref<Record<string, unknown> | Array<Record<string, unknown>>>,
    initialValues: Record<string, unknown>
  ) => {
    const flattenToSchemaObject = (schema: Array<Record<string, unknown>>): Record<string, unknown> => {
      return schema.reduce((res, field) => {
        if (field instanceof Array) {
          res = { ...res, ...flattenToSchemaObject(field) };
        }

        if (field.schema instanceof Array) {
          res[field.model as string] = { ...field, schema: flattenToSchemaObject(field.schema as Array<Record<string, unknown>>) };
        } else {
          res[field.model as string] = field;
        }
        return res;
      }, {} as Record<string, unknown>);
    };

    const filterSchemaKeys = (
      data: Record<string, unknown>,
      schema: Record<string, unknown>,
      values: Record<string, unknown>
    ) => {
      const schemaKeys = Object.keys(schema);
      for (const [key, value] of Object.entries(values)) {
        if (!schemaKeys.includes(key)) {
          continue;
        }
        const schemaEntry = schema[key] as Record<string, unknown>;
        if (value instanceof Object && schemaEntry.schema) {
          data[key] = filterSchemaKeys({}, schemaEntry.schema as Record<string, unknown>, value as Record<string, unknown>);
        } else {
          data[key] = value;
        }
      }
      return data;
    };

    if (formSchema.value instanceof Array) {
      formData.value = filterSchemaKeys(
        formData.value,
        flattenToSchemaObject(formSchema.value as Array<Record<string, unknown>>),
        initialValues
      );
    } else {
      formData.value = filterSchemaKeys(formData.value, formSchema.value as Record<string, unknown>, initialValues);
    }
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\s]+/g, '-')
      .replace(/[^\w-]+/g, '');
  };

  return {
    pluralize,
    capitalize,
    sortBy,
    groupBy,
    keyBy,
    debounce,
    flattenObject,
    unflattenObject,
    setInitialFormValues,
    equals,
    slugify
  };
}
