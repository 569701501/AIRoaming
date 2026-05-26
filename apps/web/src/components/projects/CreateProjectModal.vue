<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" role="presentation" @click.self="requestClose">
      <section class="modal-panel create-modal" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <header class="modal-header">
          <div class="title-group">
            <div class="title-icon" aria-hidden="true">
              <FolderPlus :size="20" />
            </div>
            <div>
              <span>新建项目</span>
              <h2 id="create-project-title">创建项目</h2>
            </div>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" @click="requestClose">
            <X :size="19" />
          </button>
        </header>

        <form id="create-form" class="create-form" @submit.prevent="submit">
          <label class="form-field">
            <span class="field-label">项目名称</span>
            <span class="input-frame">
              <input
                ref="nameInput"
                v-model.trim="form.name"
                type="text"
                placeholder="例如：迷雾之城"
                required
                maxlength="30"
              />
              <span class="char-count">{{ form.name.length }} / 30</span>
            </span>
          </label>

          <footer class="modal-footer">
            <button class="secondary-action" type="button" :disabled="loading" @click="requestClose">取消</button>
            <button class="primary-action" type="submit" :disabled="loading || !canSubmit">
              <Sparkles :size="16" />
              <span>{{ loading ? "创建中..." : "创建项目" }}</span>
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { FolderPlus, Sparkles, X } from "lucide-vue-next";
import type { CreateProjectRequest, ProjectType } from "@airoaming/shared";

const props = defineProps<{
  open: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  close: [];
  create: [input: CreateProjectRequest];
}>();

const nameInput = ref<HTMLInputElement | null>(null);

const form = reactive({
  name: "",
  type: "comic" as ProjectType,
});

const canSubmit = computed(() => form.name.trim().length > 0);

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) {
      return;
    }

    form.name = "";
    form.type = "comic";
    await nextTick();
    nameInput.value?.focus();
  },
);

function requestClose() {
  if (!props.loading) {
    emit("close");
  }
}

function submit() {
  if (!canSubmit.value || props.loading) {
    return;
  }

  emit("create", {
    name: form.name.trim(),
    type: form.type,
  });
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 50% 18%, rgba(92, 62, 255, 0.2), transparent 36%),
    rgba(2, 6, 16, 0.78);
  backdrop-filter: blur(10px);
}

.create-modal {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: hidden;
  border: 1px solid rgba(105, 88, 255, 0.24);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(13, 21, 39, 0.98), rgba(6, 12, 26, 0.98)),
    #08101f;
  box-shadow:
    0 34px 90px rgba(0, 0, 0, 0.56),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 84px;
  padding: 18px 20px 18px 24px;
  border-bottom: 1px solid rgba(123, 104, 255, 0.14);
  background:
    linear-gradient(90deg, rgba(123, 104, 255, 0.14), transparent 58%),
    rgba(8, 15, 31, 0.74);
}

.title-group {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 14px;
}

.title-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(157, 139, 255, 0.32);
  border-radius: 12px;
  color: #ded8ff;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(79, 70, 229, 0.92));
  box-shadow: 0 14px 30px rgba(91, 69, 255, 0.32);
}

.modal-header span {
  color: #9c87ff;
  font-size: 13px;
  font-weight: 900;
}

.modal-header h2 {
  margin: 5px 0 0;
  color: #f8fbff;
  font-size: 24px;
  font-weight: 900;
  line-height: 1.2;
}

.icon-button {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(206, 216, 244, 0.16);
  border-radius: 10px;
  color: #cbd6ee;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.icon-button:hover {
  border-color: rgba(206, 216, 244, 0.28);
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background:
    radial-gradient(circle at 76% 0%, rgba(34, 199, 169, 0.08), transparent 32%),
    rgba(6, 12, 26, 0.42);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-label {
  color: #e5ebf7;
  font-size: 14px;
  font-weight: 800;
}

.input-frame {
  position: relative;
  display: flex;
  align-items: center;
}

.input-frame input {
  width: 100%;
  min-height: 48px;
  border: 1px solid rgba(206, 216, 244, 0.14);
  border-radius: 12px;
  outline: none;
  background: rgba(255, 255, 255, 0.045);
  color: #f8fbff;
  padding: 0 72px 0 14px;
  font-size: 15px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.input-frame input::placeholder {
  color: #6f7c94;
}

.input-frame input:focus {
  border-color: rgba(142, 121, 255, 0.74);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.16);
}

.char-count {
  position: absolute;
  right: 14px;
  color: #6f7c94;
  font-size: 12px;
  pointer-events: none;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 2px;
}

.secondary-action,
.primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  border-radius: 10px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 850;
  cursor: pointer;
  transition: transform 0.18s ease, opacity 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.secondary-action {
  border: 1px solid rgba(206, 216, 244, 0.16);
  color: #d8e2f6;
  background: rgba(255, 255, 255, 0.035);
}

.primary-action {
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  color: #ffffff;
  background: linear-gradient(135deg, #7c3aed, #4f46e5 56%, #22c7a9);
  box-shadow: 0 16px 36px rgba(91, 69, 255, 0.34);
}

.secondary-action:hover,
.primary-action:hover {
  transform: translateY(-1px);
}

.secondary-action:disabled,
.primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}

@media (max-width: 560px) {
  .modal-backdrop {
    padding: 16px;
  }

  .modal-header {
    padding: 16px;
  }

  .modal-header h2 {
    font-size: 21px;
  }

  .create-form {
    padding: 18px;
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .secondary-action,
  .primary-action {
    width: 100%;
  }
}
</style>
