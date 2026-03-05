<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { useManuscriptStore } from '@/store/useManuscriptStore';

const { t } = useI18n();
const store = useManuscriptStore();

const affiliationOptions = computed(() =>
  store.metadata.affiliations.map((item) => ({
    label: `${item.org}（${item.city}）`,
    value: item.id,
  })),
);

const correspondingAuthorOptions = computed(() =>
  store.metadata.authors.map((author, index) => ({
    label: author.name.trim() || author.nameEn.trim() || `${t('form.authors')} ${index + 1}`,
    value: author.id,
  })),
);

const resetSample = (): void => {
  store.resetToSample();
  MessagePlugin.success(t('app.loadedSample'));
};

const fillExportFixture = (): void => {
  store.loadExportFixture();
  MessagePlugin.success(t('app.fixtureLoaded'));
};
</script>

<template>
  <div class="panel-scroll meta-form">
    <TForm :data="store.metadata" label-align="top" colon>
      <TFormItem :label="t('form.title')">
        <TInput v-model="store.metadata.title" :placeholder="t('form.titlePlaceholder')" clearable />
      </TFormItem>

      <TFormItem :label="t('form.subtitle')">
        <TInput
          v-model="store.metadata.subtitle"
          :placeholder="t('form.subtitlePlaceholder')"
          clearable
        />
      </TFormItem>

      <TFormItem :label="t('form.abstract')">
        <TTextarea
          v-model="store.metadata.abstract"
          :placeholder="t('form.abstractPlaceholder')"
          :autosize="{ minRows: 5, maxRows: 10 }"
        />
      </TFormItem>

      <TFormItem :label="t('form.keywords')">
        <TTagInput
          v-model="store.metadata.keywords"
          :placeholder="t('form.keywordsPlaceholder')"
          clearable
        />
      </TFormItem>

      <TFormItem :label="t('form.affiliations')">
        <TSpace direction="vertical" style="width: 100%" size="12px">
          <TCard
            v-for="(affiliation, index) in store.metadata.affiliations"
            :key="affiliation.id"
            :title="`${t('form.affiliations')} ${index + 1}`"
            size="small"
          >
            <TSpace direction="vertical" style="width: 100%" size="10px">
              <TInput
                v-model="affiliation.org"
                :label="t('form.affiliationOrg')"
                :placeholder="t('form.affiliationOrgPlaceholder')"
                clearable
              />
              <TInput
                v-model="affiliation.city"
                :label="t('form.affiliationCity')"
                :placeholder="t('form.affiliationCityPlaceholder')"
                clearable
              />
              <TInput
                v-model="affiliation.country"
                :label="t('form.affiliationCountry')"
                :placeholder="t('form.affiliationCountryPlaceholder')"
                clearable
              />
              <div class="meta-form__remove-wrap">
                <TButton
                  variant="outline"
                  theme="danger"
                  size="small"
                  @click="store.removeAffiliation(affiliation.id)"
                >
                  <template #icon>
                    <Icon icon="mdi:close" />
                  </template>
                  {{ t('form.removeAffiliation') }}
                </TButton>
              </div>
            </TSpace>
          </TCard>

          <TButton variant="dashed" @click="store.addAffiliation">
            <template #icon>
              <Icon icon="mdi:plus" />
            </template>
            {{ t('form.addAffiliation') }}
          </TButton>
        </TSpace>
      </TFormItem>

      <TFormItem :label="t('form.authors')">
        <TSpace direction="vertical" style="width: 100%" size="12px">
          <TCard
            v-for="(author, index) in store.metadata.authors"
            :key="author.id"
            :title="`${t('form.authors')} ${index + 1}`"
            size="small"
          >
            <TSpace direction="vertical" style="width: 100%" size="10px">
              <TInput
                v-model="author.name"
                :label="t('form.authorName')"
                :placeholder="t('form.authorNamePlaceholder')"
                clearable
              />
              <TInput
                v-model="author.nameEn"
                :label="t('form.authorNameEn')"
                :placeholder="t('form.authorNameEnPlaceholder')"
                clearable
              />
              <TInput
                v-model="author.email"
                :label="t('form.authorEmail')"
                :placeholder="t('form.authorEmailPlaceholder')"
                clearable
              />
              <TSelect
                v-model="author.affiliationIds"
                :label="t('form.authorAffiliations')"
                :placeholder="t('form.authorAffiliations')"
                :options="affiliationOptions"
                multiple
                clearable
              />
              <div class="meta-form__remove-wrap">
                <TButton
                  variant="outline"
                  theme="danger"
                  size="small"
                  @click="store.removeAuthor(author.id)"
                >
                  <template #icon>
                    <Icon icon="mdi:close" />
                  </template>
                  {{ t('form.removeAuthor') }}
                </TButton>
              </div>
            </TSpace>
          </TCard>

          <TButton variant="dashed" @click="store.addAuthor">
            <template #icon>
              <Icon icon="mdi:plus" />
            </template>
            {{ t('form.addAuthor') }}
          </TButton>
        </TSpace>
      </TFormItem>

      <TFormItem :label="t('form.correspondingAuthor')">
        <TSpace direction="vertical" style="width: 100%" size="10px">
          <TSelect
            v-model="store.metadata.correspondingAuthorId"
            :placeholder="t('form.correspondingAuthorPlaceholder')"
            :options="correspondingAuthorOptions"
            clearable
          />
          <TInput
            v-model="store.metadata.correspondingAuthorContact"
            :label="t('form.correspondingAuthorContact')"
            :placeholder="t('form.correspondingAuthorContactPlaceholder')"
            clearable
          />
        </TSpace>
      </TFormItem>

      <TFormItem :label="t('form.fundings')">
        <TSpace direction="vertical" style="width: 100%" size="8px">
          <TInput
            v-for="funding in store.metadata.fundings"
            :key="funding.id"
            v-model="funding.text"
            :placeholder="t('form.fundingPlaceholder')"
            clearable
          >
            <template #suffix>
              <TButton
                shape="square"
                variant="text"
                theme="danger"
                @click="store.removeFunding(funding.id)"
              >
                <Icon icon="mdi:delete-outline" />
              </TButton>
            </template>
          </TInput>

          <TButton variant="dashed" @click="store.addFunding">
            <template #icon>
              <Icon icon="mdi:plus" />
            </template>
            {{ t('form.addFunding') }}
          </TButton>
        </TSpace>
      </TFormItem>

      <TFormItem>
        <TSpace align="center">
          <TSwitch v-model="store.enableDraftPersistence" />
          <span>{{ t('form.enableDraftPersistence') }}</span>
        </TSpace>
      </TFormItem>

      <TFormItem>
        <TSpace>
          <TButton variant="outline" @click="resetSample">
            <template #icon>
              <Icon icon="mdi:restart" />
            </template>
            {{ t('form.resetSample') }}
          </TButton>

          <TButton variant="outline" @click="fillExportFixture">
            <template #icon>
              <Icon icon="mdi:file-document-refresh-outline" />
            </template>
            {{ t('form.loadExportFixture') }}
          </TButton>
        </TSpace>
      </TFormItem>
    </TForm>
  </div>
</template>
