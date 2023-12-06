import { Ref } from 'vue';

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

  const sortBy = (key: string) => (a: Record<string, any>, b: Record<string, any>) =>
    a[key] > b[key] ? 1 : b[key] > a[key] ? -1 : 0;

  const groupBy = (array: Array<any>, key: string) =>
    (array || []).reduce((r, v, _i, _a, k = v[key]) => ((r[k] || (r[k] = [])).push(v), r), {});

  const keyBy = (array: Array<any>, key: string) =>
    (array || []).reduce((r, x) => ({ ...r, [key ? x[key] : x]: x }), {});

  const debounce = <T extends (...args: any[]) => any>(
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
    object: Record<string, any>,
    parents: Array<string> = []
  ): Record<string, string> => {
    return Object.assign(
      {},
      ...Object.entries(object).map(([k, v]) =>
        v && typeof v === 'object'
          ? flattenObject(v, [...parents, k])
          : { [[...parents, k].join('.')]: v }
      )
    );
  };

  const unflattenObject = (obj: Record<string, any>) =>
    Object.keys(obj).reduce((res, k) => {
      k.split('.').reduce(
        (acc: Record<string, any>, e, i, keys) =>
          acc[e] ||
          (acc[e] = isNaN(Number(keys[i + 1])) ? (keys.length - 1 === i ? obj[k] : {}) : []),
        res
      );
      return res;
    }, {});

  const equals = (a: Array<any>, b: Array<any>) => {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  };

  const setInitialFormValues = (
    formData: Ref<Record<string, any>>,
    formSchema: Ref<Record<string, any>> | Ref<Array<Record<string, any>>>,
    initialValues: Record<string, any>
  ) => {
    const flattenToSchemaObject = (schema: Array<Record<string, any>>): Record<string, any> => {
      return schema.reduce((res, field) => {
        if (field instanceof Array) {
          res = { ...res, ...flattenToSchemaObject(field) };
        }

        if (field.schema instanceof Array) {
          res[field.model] = { ...field, schema: flattenToSchemaObject(field.schema) };
        } else {
          res[field.model] = field;
        }
        return res;
      }, {});
    };

    const filterSchemaKeys = (
      data: Record<string, any>,
      schema: Record<string, any>,
      values: Record<string, any>
    ) => {
      const schemaKeys = Object.keys(schema);
      for (const [key, value] of Object.entries(values)) {
        if (!schemaKeys.includes(key)) {
          continue;
        }
        if (value instanceof Object && schema[key].schema) {
          data[key] = filterSchemaKeys({}, schema[key].schema, values[key]);
        } else {
          data[key] = values[key];
        }
      }
      return data;
    };

    if (formSchema.value instanceof Array) {
      formData.value = filterSchemaKeys(
        formData.value,
        flattenToSchemaObject(formSchema.value),
        initialValues
      );
    } else {
      formData.value = filterSchemaKeys(formData.value, formSchema.value, initialValues);
    }
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
    formatDate,
    formatDateTimeAgo
  };
}
