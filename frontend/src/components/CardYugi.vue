<template>

    <div class="flex flex-row gap-2 " >
        <img alt="imagew" @mouseover="toggle" @mouseleave="toggle" class="h-21 w-15" :src="'src/assets/Cards/'+componentCard.id+'.jpg'"/>

        <div class="flex flex-col gap-2">
            <p>{{ componentCard.name }}</p>
            <div v-for="set in componentCard.card_sets">
                <p> Sets: {{ set.set_code }}</p>
            </div>
            
            <div class="flex flex-row gap-3">
                
                <p v-if="componentCard.atk != null" >ATK {{ componentCard.atk }} </p>
                <p v-if="componentCard.def != null" > DEF {{ componentCard.def }}</p>
            </div>
            
            <p v-if="over">{{ componentCard.desc }}</p>
        </div>
        
        
    </div>
    

</template>

<script>
    export default {
      
        props: ['componentCard'],
        data() {
            return {
                over: false,
            };
        
        },
        methods: {
        toggle(){
            this.over = !this.over;
        },
        },
        mounted() {
            
        },
  };

</script>
